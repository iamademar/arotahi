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

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = SERVICE_ROOT / "data"

# Copied as-is from the modelling project's outputs.
COPY_FILES = [
    ("data/processed/features_1km_lag0.parquet", "features_1km_lag0.parquet"),
    ("data/processed/scores_2024_1km_lag0.parquet", "scores_2024_1km_lag0.parquet"),
    ("data/processed/scores_2025_1km_lag0.parquet", "scores_2025_1km_lag0.parquet"),
    ("data/processed/snapshot_manifest.json", "snapshot_manifest.json"),
    ("outputs/model_card.md", "model_card.md"),
    ("outputs/feature_dictionary.csv", "feature_dictionary.csv"),
    ("outputs/panel_coverage.csv", "panel_coverage.csv"),
]


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
