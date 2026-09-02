"""Export everything the service needs from the ml modelling project.

The service is standalone at runtime: it must not read the 190 MB raw CAS
snapshot, nor import the modelling library's data-loading code. This script is
the one bridge, run from the modelling project whenever the model or the source
snapshot changes.

    python scripts/export_serving_data.py [--ml-root ../ml]
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = SERVICE_ROOT / "data"

# Must stay in step with app/dependencies.py's SERVED_YEARS. Declared here rather
# than imported: importing app.dependencies pulls in the vendored cas_area and
# asserts a model artefact exists, but this script runs *before* the model is
# trained on a fresh setup.
SERVED_YEARS = (2024, 2025)

FEATURE_SOURCE = "data/processed/features_1km_lag0.parquet"

# Copied as-is from the modelling project's outputs. The feature matrix is not
# here: it is filtered on the way through, see export_serving_features.
COPY_FILES = [
    ("data/processed/scores_2024_1km_lag0.parquet", "scores_2024_1km_lag0.parquet"),
    ("data/processed/scores_2025_1km_lag0.parquet", "scores_2025_1km_lag0.parquet"),
    ("data/processed/snapshot_manifest.json", "snapshot_manifest.json"),
    ("outputs/model_card.md", "model_card.md"),
    ("outputs/feature_dictionary.csv", "feature_dictionary.csv"),
    ("outputs/panel_coverage.csv", "panel_coverage.csv"),
]


def export_serving_features(ml_root: Path) -> Path:
    """Copy the feature matrix, keeping only the years the service actually serves.

    The modelling project's file holds all fifteen years (2011-2025, 309k rows) in
    a *single row group*. That layout defeats a `filters=` predicate pushdown at
    read time — pyarrow decompresses the whole group before it can drop a row — so
    the service used to spend 1.3 GB at startup to retain 15 MB of scores.

    Filtering here instead is what makes a 1 GiB container viable: 17 MB -> 3.1 MB
    on disk, 1.3 GB -> 569 MB peak RSS, and the row_group_size keeps the result
    chunked so a future reader can prune. Predictions are bit-identical; the API
    parity test in tests/test_api.py is the guard.
    """
    table = pq.read_table(
        ml_root / FEATURE_SOURCE,
        filters=[("target_year", "in", list(SERVED_YEARS))],
    )
    out = DATA_DIR / "features_1km_lag0.parquet"
    pq.write_table(table, out, compression="snappy", row_group_size=8192)
    return out


def export_cell_year_counts(ml_root: Path) -> Path:
    """Precompute per-cell yearly crash counts for the history endpoint.

    Derived here once (0.5 MB) so the service never parses the 190 MB raw CSV.
    """
    sys.path.insert(0, str(ml_root / "src"))
    from cas_area import grid, io, panel

    crashes = io.add_severity_flags(io.load_raw(io.raw_csv_path(ml_root)))
    crashes = grid.assign_cells(crashes)
    counts = panel.cell_year_counts(crashes)

    out = DATA_DIR / "cell_year_counts.parquet"
    counts.to_parquet(out, index=False)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ml-root", type=Path, default=SERVICE_ROOT.parent / "ml",
                        help="Path to the ml modelling project (default: ../ml)")
    args = parser.parse_args()

    ml_root = args.ml_root.resolve()
    if not (ml_root / "src" / "cas_area").is_dir():
        print(f"No modelling project at {ml_root}. Pass --ml-root.", file=sys.stderr)
        return 1

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    missing = []

    for source, target in COPY_FILES:
        src = ml_root / source
        if not src.exists():
            missing.append(source)
            continue
        shutil.copy2(src, DATA_DIR / target)
        print(f"  {target:<38} {(DATA_DIR / target).stat().st_size / 1e6:>7.2f} MB")

    if not (ml_root / FEATURE_SOURCE).exists():
        missing.append(FEATURE_SOURCE)
    else:
        out = export_serving_features(ml_root)
        years = ", ".join(str(y) for y in SERVED_YEARS)
        print(f"  {out.name:<38} {out.stat().st_size / 1e6:>7.2f} MB  ({years} only)")

    if missing:
        print(f"\nMissing from the modelling project: {missing}", file=sys.stderr)
        print("Run its notebooks first.", file=sys.stderr)
        return 1

    out = export_cell_year_counts(ml_root)
    print(f"  {out.name:<38} {out.stat().st_size / 1e6:>7.2f} MB  (derived)")

    total = sum(p.stat().st_size for p in DATA_DIR.iterdir() if p.is_file())
    print(f"\nExported to {DATA_DIR.relative_to(SERVICE_ROOT)}: {total / 1e6:.1f} MB total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
