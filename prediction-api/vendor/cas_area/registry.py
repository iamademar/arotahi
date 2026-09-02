"""Model persistence: save, load and score with a fitted model (spec 5.4, 8).

Every model before this was fitted in memory inside a notebook and discarded, so
nothing could serve a prediction. A saved bundle carries everything needed to
reproduce a score: the fitted pipeline, the calibrator, the exact predictor
columns in order, and the provenance stamps.

The calibrator travels with the pipeline deliberately. Serving the pipeline alone
would return uncalibrated ranking scores while calling them probabilities, which
is the difference between a Brier score of 0.059 and 0.157.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from . import FEATURE_SCHEMA_VERSION, GRID_VERSION, MODEL_VERSION
from .modelling import apply_calibrator

BUNDLE_FORMAT_VERSION = 1


@dataclass
class ModelBundle:
    """A fitted model plus everything needed to score with it reproducibly."""

    pipeline: Any
    calibrator: Any
    columns: list[str]
    model_version: str = MODEL_VERSION
    grid_version: str = GRID_VERSION
    feature_schema_version: str = FEATURE_SCHEMA_VERSION
    source_snapshot_id: str = ""
    trained_on_years: tuple[int, ...] = ()
    calibrated_on_years: tuple[int, ...] = ()
    created_at: str = ""
    format_version: int = BUNDLE_FORMAT_VERSION
    metrics: dict = field(default_factory=dict)

    def provenance(self) -> dict:
        """The stamps every scored response must carry."""
        return {
            "model_version": self.model_version,
            "grid_version": self.grid_version,
            "feature_schema_version": self.feature_schema_version,
            "source_snapshot_id": self.source_snapshot_id,
        }


def save_model(path: str | Path, bundle: ModelBundle) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not bundle.created_at:
        bundle.created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    joblib.dump(bundle, path, compress=3)
    return path


def load_model(path: str | Path) -> ModelBundle:
    bundle = joblib.load(Path(path))
    if not isinstance(bundle, ModelBundle):
        raise TypeError(f"{path} does not contain a ModelBundle")
    if bundle.format_version != BUNDLE_FORMAT_VERSION:
        raise ValueError(
            f"Bundle format {bundle.format_version} is not supported "
            f"(expected {BUNDLE_FORMAT_VERSION}); retrain and save again"
        )
    return bundle


def predict_calibrated(bundle: ModelBundle, frame: pd.DataFrame) -> np.ndarray:
    """Calibrated probabilities for the supplied feature rows.

    Columns are selected by the persisted list rather than recomputed. A silently
    reordered feature matrix would otherwise produce wrong numbers with no error,
    which is the worst failure mode available here.
    """
    missing = [column for column in bundle.columns if column not in frame.columns]
    if missing:
        raise KeyError(
            f"Feature matrix is missing {len(missing)} column(s) the model needs, "
            f"first few: {missing[:5]}"
        )
    raw = bundle.pipeline.predict_proba(frame[bundle.columns])[:, 1]
    if bundle.calibrator is None:
        return raw
    return apply_calibrator(bundle.calibrator, raw)


def default_model_path(models_dir: Path, model_version: str = MODEL_VERSION) -> Path:
    """Artefact path inside a models directory.

    Takes the directory itself rather than a project root: the service is a
    standalone sibling of the modelling project, so there is no shared root to
    resolve against.
    """
    return Path(models_dir) / f"{model_version}.joblib"
