"""Model and data loading, done once at startup.

The service is self-contained: it reads only its own ``data/`` directory and its
own vendored copy of the modelling library, so it can run with the ml project
absent. Data is produced by ``scripts/export_serving_data.py``.

The exported feature matrix is about 600 MB in memory across fifteen years, so
only the served years are held. Scoring is fast (single-row prediction is under
2 ms), so probabilities are computed once per served year at startup and the
ranks derived from them, rather than recomputed per request.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

import pandas as pd

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT / "vendor") not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT / "vendor"))

from cas_area import registry  # noqa: E402

# Backtest years the service exposes. Both have known outcomes, so a consumer can
# compare a prediction against what actually happened.
SERVED_YEARS = (2024, 2025)

DATA_DIR = SERVICE_ROOT / "data"
MODELS_DIR = SERVICE_ROOT / "models"

FEATURE_PATH = DATA_DIR / "features_1km_lag0.parquet"
HISTORY_PATH = DATA_DIR / "cell_year_counts.parquet"
CARD_PATH = DATA_DIR / "model_card.md"
DICTIONARY_PATH = DATA_DIR / "feature_dictionary.csv"
COVERAGE_PATH = DATA_DIR / "panel_coverage.csv"

# Columns surfaced on an area response beyond the score itself.
CONTEXT_COLUMNS = ["region", "tla", "history_sufficiency", "crash_count_5y", "severe_count_5y"]


def model_path(model_version: str | None = None) -> Path:
    from cas_area import MODEL_VERSION

    return MODELS_DIR / f"{model_version or MODEL_VERSION}.joblib"


class ServiceState:
    """Everything the request handlers need, loaded once."""

    def __init__(self) -> None:
        path = model_path()
        if not path.exists():
            raise FileNotFoundError(
                f"No model artefact at {path}. Run scripts/train_and_save.py first."
            )
        self.bundle = registry.load_model(path)
        self.scores: dict[int, pd.DataFrame] = {}
        self.coverage: dict[int, float] = {}
        self._load_scores()
        self._load_coverage()

    def _load_scores(self) -> None:
        if not FEATURE_PATH.exists():
            raise FileNotFoundError(
                f"{FEATURE_PATH} not found. Run scripts/export_serving_data.py."
            )
        frame = pd.read_parquet(FEATURE_PATH)
        for year in SERVED_YEARS:
            held = frame[frame["target_year"] == year]
            if held.empty:
                continue
            scored = held[["cell_id", "target_year", "target", *CONTEXT_COLUMNS]].copy()
            scored["probability"] = registry.predict_calibrated(self.bundle, held)

            # Rank on the uncalibrated score, report the calibrated probability.
            # Isotonic calibration is a step function: it collapses ~21k cells onto
            # ~100 distinct probabilities, so ranking on it would tie the top cells
            # together and make their order arbitrary. The raw score preserves the
            # fine ordering (Spearman 0.998 against the calibrated value), which is
            # what a capacity-limited review list actually needs.
            scored["_rank_score"] = self.bundle.pipeline.predict_proba(
                held[self.bundle.columns])[:, 1]
            scored["national_percentile"] = scored["_rank_score"].rank(pct=True)
            scored["national_rank"] = (
                scored["_rank_score"].rank(ascending=False, method="first").astype(int))
            scored["regional_percentile"] = scored.groupby("region")["_rank_score"].rank(pct=True)
            scored["regional_rank"] = (
                scored.groupby("region")["_rank_score"]
                .rank(ascending=False, method="first").astype(int))
            self.scores[year] = scored.sort_values("_rank_score", ascending=False)

    def _load_coverage(self) -> None:
        if not COVERAGE_PATH.exists():
            return
        table = pd.read_csv(COVERAGE_PATH).set_index("target_year")
        for year in SERVED_YEARS:
            if year in table.index:
                self.coverage[year] = float(table.loc[year, "eligible_coverage"])

    def year_or_none(self, year: int) -> pd.DataFrame | None:
        return self.scores.get(year)

    def cell_row(self, year: int, cell_id: str) -> pd.Series | None:
        frame = self.scores.get(year)
        if frame is None:
            return None
        match = frame[frame["cell_id"] == cell_id]
        return None if match.empty else match.iloc[0]


@lru_cache(maxsize=1)
def get_state() -> ServiceState:
    return ServiceState()


@lru_cache(maxsize=1)
def get_crash_history() -> pd.DataFrame:
    """Per-cell, per-year crash counts.

    Precomputed by the export script (0.5 MB) rather than derived from the raw
    190 MB CAS snapshot, which the service does not carry.
    """
    if not HISTORY_PATH.exists():
        raise FileNotFoundError(
            f"{HISTORY_PATH} not found. Run scripts/export_serving_data.py."
        )
    return pd.read_parquet(HISTORY_PATH)
