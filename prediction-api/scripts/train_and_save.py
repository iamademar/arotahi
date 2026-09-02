"""Fit the recommended model and save it for serving.

Trains on 2011-2023 (training plus validation years) and calibrates on pooled
out-of-fold predictions from the 2019-2023 expanding-window folds. The locked
test years 2024 and 2025 are never used for fitting or calibration, so the
frozen backtest numbers stay honest.

Retraining is a modelling activity, so unlike serving it needs the ml project
(for its feature matrix and the wider library). Serving itself is standalone.

    python scripts/train_and_save.py [--ml-root ../ml]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT / "vendor"))

from cas_area import (  # noqa: E402
    FEATURE_SCHEMA_VERSION, GRID_VERSION, MODEL_VERSION,
    evaluation, features, io, metrics, modelling, registry,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ml-root", type=Path, default=SERVICE_ROOT.parent / "ml",
                        help="Path to the ml modelling project (default: ../ml)")
    parser.add_argument("--features", type=Path, default=None,
                        help="Feature matrix; defaults to the service's exported copy")
    args = parser.parse_args()

    # Prefer the service's own exported matrix so training works without the ml
    # project when the data has already been exported.
    feature_path = args.features or (SERVICE_ROOT / "data" / "features_1km_lag0.parquet")
    if not feature_path.exists():
        feature_path = args.ml_root / "data" / "processed" / "features_1km_lag0.parquet"
    if not feature_path.exists():
        print(f"No feature matrix found. Looked in {SERVICE_ROOT / 'data'} and "
              f"{args.ml_root / 'data' / 'processed'}.", file=sys.stderr)
        print("Run scripts/export_serving_data.py, or the ml notebooks.", file=sys.stderr)
        return 1

    frame = pd.read_parquet(feature_path)
    columns = features.predictor_columns(frame)

    fit_years = tuple(list(modelling.TRAIN_YEARS) + [modelling.VALIDATION_YEAR])
    locked = set(modelling.TEST_YEARS) & set(fit_years)
    assert not locked, f"locked test years must never be fitted on: {locked}"

    fit_rows = frame[frame["target_year"].isin(fit_years)]
    print(f"Fitting on {len(fit_rows):,} rows from {fit_years[0]}-{fit_years[-1]} "
          f"with {len(columns)} predictors")

    pipeline = modelling.make_gradient_boosted(fit_rows, columns)
    pipeline.fit(fit_rows[columns], fit_rows["target"])

    print("Calibrating on pooled out-of-fold predictions (folds 2019-2023)")
    oof = modelling.out_of_fold_predictions(modelling.make_gradient_boosted, frame, columns)
    calibrator = modelling.fit_calibrator(oof, method="isotonic")

    snapshot_id = ""
    for candidate in (SERVICE_ROOT / "data" / "snapshot_manifest.json",
                      args.ml_root / "data" / "processed" / "snapshot_manifest.json"):
        if candidate.exists():
            snapshot_id = io.snapshot_id(json.loads(candidate.read_text()))
            break

    bundle = registry.ModelBundle(
        pipeline=pipeline,
        calibrator=calibrator,
        columns=columns,
        model_version=MODEL_VERSION,
        grid_version=GRID_VERSION,
        feature_schema_version=FEATURE_SCHEMA_VERSION,
        source_snapshot_id=snapshot_id,
        trained_on_years=fit_years,
        calibrated_on_years=tuple(sorted(oof["target_year"].unique())),
    )

    # Record locked-year performance for the model card endpoint. These years are
    # scored, never fitted on, so this does not compromise the backtest.
    for year in modelling.TEST_YEARS:
        held = frame[frame["target_year"] == year]
        scored = held.assign(score=registry.predict_calibrated(bundle, held))
        bundle.metrics[str(year)] = {
            "primary_within_region_recall_5pct": metrics.primary_metric(scored, "score"),
            **metrics.probability_metrics(scored["target"], scored["score"]),
            "waikato_recall_50": evaluation.waikato_recall(scored, "score")[0],
        }
        print(f"  {year}: primary {bundle.metrics[str(year)]['primary_within_region_recall_5pct']:.4f} "
              f"| Brier {bundle.metrics[str(year)]['brier']:.4f}")

    out = registry.save_model(
        registry.default_model_path(SERVICE_ROOT / "models"), bundle)
    print(f"\nSaved {out.relative_to(SERVICE_ROOT)} ({out.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
