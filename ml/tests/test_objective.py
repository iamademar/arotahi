"""Tests for the search objective and its locked-test-year guard.

The guard is the mechanical enforcement of test discipline during an autonomous
search, so it is tested as carefully as the leakage tests.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "experiments"))

import objective  # noqa: E402
from cas_area import features, modelling  # noqa: E402


def test_guard_fires_on_locked_years():
    for year in (2024, 2025):
        frame = pd.DataFrame({"target_year": [2019, year], "target": [0, 1]})
        with pytest.raises(objective.LockedTestYearError):
            objective.assert_no_locked_years(frame)


def test_guard_allows_search_years():
    frame = pd.DataFrame({"target_year": [2019, 2020, 2023], "target": [0, 1, 0]})
    objective.assert_no_locked_years(frame)  # must not raise


def test_guard_names_the_offending_year():
    frame = pd.DataFrame({"target_year": [2024], "target": [1]})
    with pytest.raises(objective.LockedTestYearError, match="2024"):
        objective.assert_no_locked_years(frame)


def test_folds_never_validate_on_a_locked_year():
    validation_years = {v for _, v in modelling.expanding_folds()}
    assert not (validation_years & objective.LOCKED_TEST_YEARS)


def test_fold_scores_rejects_a_locked_fold():
    frame = pd.DataFrame({"target_year": [2019], "target": [0], "x": [1.0]})
    with pytest.raises(objective.LockedTestYearError):
        objective.fold_scores(frame, modelling.make_logistic, ["x"],
                              folds=[((2019, 2020), 2024)])


def test_format_result_reports_every_fold():
    line = objective.format_result("track1", 0.2800, {2019: 0.29, 2020: 0.27}, previous=0.2673)
    assert "0.2800" in line and "+0.0127" in line and "2019:0.2900" in line


@pytest.mark.slow
def test_cv_objective_reproduces_the_recorded_baseline():
    """Regression test on the starting point: the current model scores 0.2673."""
    path = ROOT / "data" / "processed" / "features_1km_lag0.parquet"
    if not path.exists():
        pytest.skip("feature matrix not built")
    frame = pd.read_parquet(path)
    value = objective.cv_objective(
        frame, modelling.make_gradient_boosted, features.predictor_columns(frame))
    assert value == pytest.approx(objective.BASELINE_OBJECTIVE, abs=5e-4)
