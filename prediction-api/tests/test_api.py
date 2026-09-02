"""Endpoint tests for the prediction API.

The parity test is the important one: it proves that model persistence,
calibration and predictor-column ordering all survived the round trip. A silent
column reordering would produce plausible-looking but wrong probabilities, so it
is checked against the frozen backtest scores rather than against itself.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))
sys.path.insert(0, str(SERVICE_ROOT / "vendor"))

from cas_area import registry  # noqa: E402

MODEL_PATH = registry.default_model_path(SERVICE_ROOT / "models")
pytestmark = pytest.mark.skipif(
    not MODEL_PATH.exists(),
    reason="model artefact not built; run prediction-api/scripts/train_and_save.py",
)


@pytest.fixture(scope="module")
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture(scope="module")
def frozen_2025() -> pd.DataFrame:
    path = SERVICE_ROOT / "data" / "scores_2025_1km_lag0.parquet"
    if not path.exists():
        pytest.skip("frozen scores not available")
    return pd.read_parquet(path)


def test_health_reports_the_loaded_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["model_version"] == "cas-area-risk-1.0.0"
    assert 2024 in body["years_available"] and 2025 in body["years_available"]
    # Locked test years must never have been fitted on.
    assert 2024 not in body["trained_on_years"]
    assert 2025 not in body["trained_on_years"]


def test_probability_matches_the_frozen_backtest(client, frozen_2025):
    """Persistence, calibration and column order all survived the round trip.

    Probabilities must match exactly. Ranks are deliberately not compared: the
    frozen scores ranked on the calibrated probability, which is an isotonic step
    function that ties thousands of cells together, while the service ranks on the
    underlying score so the review list has a meaningful order.
    """
    sample = frozen_2025.sample(50, random_state=0)
    for _, expected in sample.iterrows():
        got = client.get(f"/api/runs/2025/areas/{expected['cell_id']}").json()
        assert got["probability"] == pytest.approx(expected["probability"], abs=1e-9)


def test_ranking_breaks_calibration_ties(client, frozen_2025):
    """Cells sharing a calibrated probability must still get a stable, distinct order.

    Isotonic calibration collapses ~21k cells onto ~100 distinct probabilities, so
    ranking on it would leave the top of the review list arbitrarily ordered.
    """
    tied = frozen_2025[frozen_2025["probability"] == frozen_2025["probability"].max()]
    assert len(tied) > 1, "fixture assumes the top probability is shared"

    ranks = [client.get(f"/api/runs/2025/areas/{c}").json()["national_rank"]
             for c in tied["cell_id"]]
    assert len(set(ranks)) == len(ranks), "tied probabilities must not produce tied ranks"


def test_ineligible_cell_returns_not_scored_never_a_probability(client):
    response = client.get("/api/runs/2025/areas/NZTM1K-9999-9999")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["status"] == "not scored"
    assert "not as low risk" in detail["reason"]
    assert "probability" not in detail


def test_ranked_list_is_ordered_by_descending_probability(client):
    areas = client.get("/api/runs/2024/areas?limit=25").json()["areas"]
    probabilities = [a["probability"] for a in areas]
    assert probabilities == sorted(probabilities, reverse=True)
    assert len(areas) == 25


def test_list_meta_reports_eligible_coverage(client):
    meta = client.get("/api/runs/2024/areas?limit=1").json()["meta"]
    assert meta["eligible_cells_in_year"] == 21396
    # Roughly 85% in 2024; the headline limitation must be visible to a consumer.
    assert 0.80 < meta["eligible_coverage"] < 0.90


def test_region_filter_returns_only_that_region(client):
    body = client.get("/api/runs/2024/areas?region=Waikato%20Region&limit=100").json()
    assert body["areas"], "Waikato must have eligible cells"
    assert {a["region"] for a in body["areas"]} == {"Waikato Region"}
    assert body["meta"]["total_matching"] < body["meta"]["eligible_cells_in_year"]


def test_filters_narrow_the_result_set(client):
    everything = client.get("/api/runs/2024/areas?limit=1").json()["meta"]["total_matching"]
    low = client.get(
        "/api/runs/2024/areas?history_sufficiency=low&limit=1").json()["meta"]["total_matching"]
    busy = client.get(
        "/api/runs/2024/areas?min_prior_crashes=10&limit=1").json()["meta"]["total_matching"]
    assert 0 < low < everything
    assert 0 < busy < everything


def test_paging_does_not_repeat_rows(client):
    first = client.get("/api/runs/2024/areas?limit=10&offset=0").json()["areas"]
    second = client.get("/api/runs/2024/areas?limit=10&offset=10").json()["areas"]
    assert not ({a["cell_id"] for a in first} & {a["cell_id"] for a in second})


def test_every_scored_response_carries_provenance(client):
    area = client.get("/api/runs/2024/areas?limit=1").json()["areas"][0]
    provenance = area["provenance"]
    assert provenance["model_version"] == "cas-area-risk-1.0.0"
    assert provenance["grid_version"] == "nztm-1km-origin0-v1"
    assert provenance["feature_schema_version"]
    assert provenance["source_snapshot_id"]


def test_batch_scoring_matches_single_scoring(client, frozen_2025):
    cell_ids = frozen_2025.nlargest(3, "probability")["cell_id"].tolist()
    batch = client.post("/api/score", json={"target_year": 2025, "cell_ids": cell_ids}).json()
    assert len(batch["scored"]) == 3 and not batch["not_scored"]
    for scored in batch["scored"]:
        single = client.get(f"/api/runs/2025/areas/{scored['cell_id']}").json()
        assert scored["probability"] == pytest.approx(single["probability"], abs=1e-12)


def test_batch_reports_ineligible_cells_separately(client, frozen_2025):
    real = frozen_2025["cell_id"].iat[0]
    body = client.post("/api/score",
                       json={"target_year": 2025,
                             "cell_ids": [real, "NZTM1K-9999-9999"]}).json()
    assert [s["cell_id"] for s in body["scored"]] == [real]
    assert body["not_scored"][0]["cell_id"] == "NZTM1K-9999-9999"
    assert body["not_scored"][0]["status"] == "not scored"


def test_unknown_year_is_rejected(client):
    assert client.get("/api/runs/2019/areas").status_code == 404


def test_model_card_and_features_are_served(client):
    card = client.get("/api/models/cas-area-risk-1.0.0/card")
    assert card.status_code == 200 and "Recommended model" in card.text
    dictionary = client.get("/api/models/cas-area-risk-1.0.0/features").json()
    assert dictionary["predictor_count"] == 178
    assert client.get("/api/models/nonexistent-1.0.0/card").status_code == 404
