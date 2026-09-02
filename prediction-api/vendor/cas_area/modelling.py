"""Baselines, temporal splits and candidate models (spec 5.9, 5.10, 5.13).

Fitting can be delegated to TuiML; the temporal split, ranking metrics,
calibration and selection are local because TuiML offers no year-aware splitter
and no ranking-at-K metrics.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from . import RANDOM_SEED
from .features import predictor_columns

TRAIN_YEARS = tuple(range(2011, 2023))   # 2011-2022
VALIDATION_YEAR = 2023
TEST_YEARS = (2024, 2025)                 # locked
TUNING_FOLD_YEARS = tuple(range(2019, 2024))  # expanding window, predict v


def split_table() -> pd.DataFrame:
    """The temporal split, printed in the notebook for auditability."""
    return pd.DataFrame(
        [
            {"partition": "Training and tuning", "target_years": "2011-2022",
             "feature_years": "prior five per target", "purpose": "Fit pipeline and hyperparameters"},
            {"partition": "Validation", "target_years": "2023", "feature_years": "2018-2022",
             "purpose": "Select model and shortlist policy"},
            {"partition": "Locked test 1", "target_years": "2024", "feature_years": "2019-2023",
             "purpose": "Primary future-year test"},
            {"partition": "Locked test 2", "target_years": "2025", "feature_years": "2020-2024",
             "purpose": "Temporal robustness test"},
            {"partition": "Excluded", "target_years": "2026", "feature_years": "n/a",
             "purpose": "Partial outcome year"},
        ]
    )


def expanding_folds(first_validation: int = 2019, last_validation: int = 2023):
    """Expanding-window folds: train on 2011..v-1, predict v."""
    return [(tuple(range(2011, v)), v) for v in range(first_validation, last_validation + 1)]


# ---------------------------------------------------------------------------
# Baselines (spec 5.9). These are the bar the ML models must clear.
# ---------------------------------------------------------------------------

def baseline_random(frame: pd.DataFrame, seed: int = RANDOM_SEED) -> np.ndarray:
    return np.random.default_rng(seed).random(len(frame))


def baseline_recent_severe(frame: pd.DataFrame) -> np.ndarray:
    """Rank by serious/fatal crashes in the prior five years."""
    return frame["severe_count_5y"].to_numpy(dtype=float)


def baseline_smoothed_severe_share(
    frame: pd.DataFrame, alpha: float = 1.0, beta: float = 20.0
) -> np.ndarray:
    """(severe + alpha) / (all + beta).

    beta is deliberately large relative to alpha so that a single severe crash
    in a low-volume cell does not outrank a sustained pattern; alpha=1, beta=20
    approximates the national prevalence prior of roughly 5%.
    """
    severe = frame["severe_count_5y"].to_numpy(dtype=float)
    total = frame["crash_count_5y"].to_numpy(dtype=float)
    return (severe + alpha) / (total + beta)


BASELINES = {
    "baseline_random": baseline_random,
    "baseline_recent_severe": baseline_recent_severe,
    "baseline_smoothed_share": baseline_smoothed_severe_share,
}


# ---------------------------------------------------------------------------
# ML candidates
# ---------------------------------------------------------------------------

def _column_types(frame: pd.DataFrame, columns: list[str]):
    categorical = [c for c in columns if frame[c].dtype == object]
    numeric = [c for c in columns if c not in categorical]
    return numeric, categorical


def make_logistic(frame: pd.DataFrame, columns: list[str]) -> Pipeline:
    """Weighted logistic regression; class weighting only, no SMOTE (spec 5.9)."""
    numeric, categorical = _column_types(frame, columns)
    pre = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=25), categorical),
        ]
    )
    return Pipeline(
        [
            ("pre", pre),
            ("model", LogisticRegression(
                max_iter=2000, class_weight="balanced", random_state=RANDOM_SEED)),
        ]
    )


def make_random_forest(frame: pd.DataFrame, columns: list[str]) -> Pipeline:
    numeric, categorical = _column_types(frame, columns)
    pre = ColumnTransformer(
        [
            ("num", "passthrough", numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=25), categorical),
        ]
    )
    return Pipeline(
        [
            ("pre", pre),
            ("model", RandomForestClassifier(
                n_estimators=400, min_samples_leaf=5, n_jobs=-1,
                class_weight="balanced", random_state=RANDOM_SEED)),
        ]
    )


def make_gradient_boosted(frame: pd.DataFrame, columns: list[str], **params) -> Pipeline:
    """LightGBM with native categorical handling and positive-class weighting."""
    import lightgbm as lgb

    numeric, categorical = _column_types(frame, columns)
    pre = ColumnTransformer(
        [
            ("num", "passthrough", numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=25), categorical),
        ]
    )
    defaults = dict(
        n_estimators=400, learning_rate=0.05, num_leaves=31,
        min_child_samples=30, subsample=0.9, colsample_bytree=0.8,
        class_weight="balanced", random_state=RANDOM_SEED, n_jobs=-1, verbose=-1,
    )
    defaults.update(params)
    return Pipeline([("pre", pre), ("model", lgb.LGBMClassifier(**defaults))])


MODEL_FACTORIES = {
    "logistic_regression": make_logistic,
    "random_forest": make_random_forest,
    "gradient_boosted": make_gradient_boosted,
}


def fit_predict(
    factory, train: pd.DataFrame, predict_on: pd.DataFrame, columns: list[str]
) -> np.ndarray:
    """Fit on training years only and score the held-out year."""
    model = factory(train, columns)
    model.fit(train[columns], train["target"])
    return model.predict_proba(predict_on[columns])[:, 1]


def out_of_fold_predictions(
    factory, features: pd.DataFrame, columns: list[str],
    folds=None,
) -> pd.DataFrame:
    """Pooled out-of-fold predictions across the expanding-window folds.

    Used for calibration so that no locked test year outcome is ever consumed
    (spec 5.13).
    """
    folds = folds or expanding_folds()
    rows = []
    for train_years, validation_year in folds:
        train = features[features["target_year"].isin(train_years)]
        held = features[features["target_year"] == validation_year]
        scores = fit_predict(factory, train, held, columns)
        rows.append(
            pd.DataFrame(
                {
                    "cell_id": held["cell_id"].to_numpy(),
                    "target_year": validation_year,
                    "target": held["target"].to_numpy(),
                    "raw_score": scores,
                }
            )
        )
    return pd.concat(rows, ignore_index=True)


def fit_calibrator(oof: pd.DataFrame, method: str = "isotonic"):
    """Calibrate on pooled out-of-fold predictions only."""
    from sklearn.isotonic import IsotonicRegression

    if method == "isotonic":
        calibrator = IsotonicRegression(out_of_bounds="clip")
        calibrator.fit(oof["raw_score"], oof["target"])
        return calibrator

    from sklearn.linear_model import LogisticRegression as _LR

    calibrator = _LR(max_iter=1000)
    calibrator.fit(oof[["raw_score"]], oof["target"])
    return calibrator


def apply_calibrator(calibrator, scores: np.ndarray) -> np.ndarray:
    if hasattr(calibrator, "predict_proba"):
        return calibrator.predict_proba(np.asarray(scores).reshape(-1, 1))[:, 1]
    return calibrator.predict(np.asarray(scores))


def make_count_gradient_boosted(frame: pd.DataFrame, columns: list[str], **params) -> Pipeline:
    """LightGBM with a Poisson objective, trained on severe-crash counts.

    The binary target treats a cell with four severe crashes the same as one with
    a single crash. Training on counts keeps that distinction. Ranking and
    evaluation stay on the binary outcome; only the training signal changes, so
    ``predict`` returns an expected count rather than a probability.
    """
    import lightgbm as lgb

    numeric, categorical = _column_types(frame, columns)
    pre = ColumnTransformer(
        [
            ("num", "passthrough", numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=25), categorical),
        ]
    )
    defaults = dict(
        objective="poisson", n_estimators=400, learning_rate=0.05, num_leaves=31,
        min_child_samples=30, subsample=0.9, colsample_bytree=0.8,
        random_state=RANDOM_SEED, n_jobs=-1, verbose=-1,
    )
    defaults.update(params)
    return Pipeline([("pre", pre), ("model", lgb.LGBMRegressor(**defaults))])


def fit_predict_count(
    factory, train: pd.DataFrame, predict_on: pd.DataFrame, columns: list[str],
    count_column: str = "target_severe_count",
) -> np.ndarray:
    """Fit on counts and return expected counts as the ranking score."""
    model = factory(train, columns)
    model.fit(train[columns], train[count_column])
    return model.predict(predict_on[columns])
