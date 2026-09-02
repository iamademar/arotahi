"""The single source of truth for the model-improvement search objective.

The objective is the mean primary metric across the expanding-window folds that
validate on 2019 to 2023. The locked test years 2024 and 2025 are never scored
here, and a guard enforces that mechanically rather than by convention: an
autonomous search that repeatedly selected against 2024 would inflate the final
reported figure and quietly destroy the backtest.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "src"))

from cas_area import metrics, modelling  # noqa: E402

# Never scored during the search. Only the final confirmation run may touch these.
LOCKED_TEST_YEARS = frozenset({2024, 2025})
TARGET_OBJECTIVE = 0.32

# Measured for the current gradient-boosted model before any improvement work.
BASELINE_OBJECTIVE = 0.2673


class LockedTestYearError(RuntimeError):
    """Raised when a locked test year reaches a scoring path during the search."""


def assert_no_locked_years(frame: pd.DataFrame, context: str = "") -> None:
    """Fail loudly if 2024 or 2025 appear in data about to be scored."""
    if "target_year" not in frame.columns:
        return
    present = LOCKED_TEST_YEARS & set(pd.unique(frame["target_year"]))
    if present:
        raise LockedTestYearError(
            f"Locked test year(s) {sorted(present)} reached a search scoring path"
            f"{f' ({context})' if context else ''}. The search must use folds "
            "validating on 2019-2023 only; 2024 and 2025 are scored once, at the "
            "end, on the final model."
        )


def fold_scores(
    feature_matrix: pd.DataFrame,
    factory,
    columns: list[str],
    folds=None,
    fit_predict=None,
) -> dict[int, float]:
    """Primary metric on each held-out fold year.

    Reuses ``modelling.expanding_folds``, ``modelling.fit_predict`` and
    ``metrics.primary_metric`` rather than reimplementing the protocol.

    ``fit_predict`` may be swapped for an alternative training signal (for
    example ``modelling.fit_predict_count``). Whatever it returns is treated as a
    ranking score and is always evaluated against the binary ``target``, so
    variants stay comparable.
    """
    fit_predict = fit_predict or modelling.fit_predict
    folds = folds or modelling.expanding_folds()
    out: dict[int, float] = {}

    for train_years, validation_year in folds:
        if validation_year in LOCKED_TEST_YEARS:
            raise LockedTestYearError(
                f"Fold validating on {validation_year} is a locked test year"
            )
        train = feature_matrix[feature_matrix["target_year"].isin(train_years)]
        held = feature_matrix[feature_matrix["target_year"] == validation_year]
        assert_no_locked_years(train, "training split")
        assert_no_locked_years(held, "held-out split")

        scores = fit_predict(factory, train, held, columns)
        out[validation_year] = metrics.primary_metric(held.assign(_score=scores), "_score")

    return out


def cv_objective(
    feature_matrix: pd.DataFrame,
    factory,
    columns: list[str],
    folds=None,
    fit_predict=None,
    return_folds: bool = False,
):
    """Mean primary metric across the fold years: the number the search maximises."""
    per_fold = fold_scores(feature_matrix, factory, columns, folds, fit_predict)
    value = float(np.mean(list(per_fold.values())))
    return (value, per_fold) if return_folds else value


def format_result(name: str, value: float, per_fold: dict[int, float],
                  previous: float | None = None) -> str:
    """One RESULTS.md row, so every claimed gain is auditable per fold."""
    folds = "  ".join(f"{year}:{score:.4f}" for year, score in sorted(per_fold.items()))
    delta = "" if previous is None else f" | delta {value - previous:+.4f}"
    return f"{name}: objective {value:.4f}{delta} | folds {folds}"
