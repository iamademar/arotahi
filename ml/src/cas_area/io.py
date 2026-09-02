"""Loading, validation and snapshot manifest for the CAS extract (spec 5.8 rules 1-3).

The raw CSV is treated as immutable. Everything derived is written to
``data/processed/`` or ``outputs/``.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd

# The file on disk carries a doubled extension; keep the real name here so the
# notebooks never hard-code a path that does not exist.
RAW_CSV_NAME = "Crash_Analysis_System__CAS__data.csv.csv"

EXPECTED_ROWS = 705_609
EXPECTED_COLUMNS = 72
EXPECTED_SHA256 = "967a34b12525d369cd2e406d52b529bb81bae2f0cceb5fdd37d62d714368490e"

# Columns the pipeline depends on; asserted present at load time.
REQUIRED_COLUMNS = [
    "X", "Y", "crashYear", "crashSeverity", "region", "tlaName",
    "speedLimit", "NumberOfLanes", "urban", "crashSHDescription", "holiday",
    "weatherA", "weatherB", "light", "roadSurface", "roadworks", "slipOrFlood",
    "pedestrian", "bicycle", "motorcycle", "truck", "bus", "schoolBus",
]

SEVERE_LABELS = ("Serious Crash", "Fatal Crash")

# Spec 5.8 rule 6: flag implausible values rather than imputing them.
VALID_SPEED_LIMITS = tuple(range(10, 120, 10))
VALID_LANE_COUNTS = tuple(range(1, 9))

# 2026 is partial and excluded from all training and evaluation (spec 5.10).
PARTIAL_YEAR = 2026

NUMERIC_COLUMNS = [
    "X", "Y", "crashYear", "speedLimit", "NumberOfLanes",
    "fatalCount", "seriousInjuryCount", "minorInjuryCount",
]


def project_root(start: Path | None = None) -> Path:
    """Walk upwards until the directory holding ``data/raw`` is found."""
    here = (start or Path.cwd()).resolve()
    for candidate in (here, *here.parents):
        if (candidate / "data" / "raw").is_dir():
            return candidate
    raise FileNotFoundError("Could not locate a project root containing data/raw")


def raw_csv_path(root: Path | None = None) -> Path:
    root = root or project_root()
    path = root / "data" / "raw" / RAW_CSV_NAME
    if not path.exists():
        raise FileNotFoundError(f"Raw CAS extract not found at {path}")
    return path


def sha256_of(path: Path, chunk_size: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot_manifest(path: Path, frame: pd.DataFrame) -> dict:
    """Manifest identifying the exact source snapshot used for a run."""
    return {
        "filename": path.name,
        "size_bytes": path.stat().st_size,
        "sha256": sha256_of(path),
        "row_count": int(len(frame)),
        "column_count": int(frame.shape[1]),
        "min_crash_year": int(frame["crashYear"].min()),
        "max_crash_year": int(frame["crashYear"].max()),
        "sha256_matches_spec": sha256_of(path) == EXPECTED_SHA256,
    }


def write_manifest(manifest: dict, root: Path | None = None) -> Path:
    root = root or project_root()
    out = root / "data" / "processed" / "snapshot_manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return out


def snapshot_id(manifest: dict) -> str:
    """Short, stable identifier for the snapshot, used on score outputs."""
    return manifest["sha256"][:12]


def load_raw(path: Path | None = None, cache: bool = True) -> pd.DataFrame:
    """Load the CAS CSV with BOM handling, caching the parsed frame as parquet.

    The file is 199 MB, so repeated full CSV parses are avoided by caching
    (spec 5.8 rules 1-3).
    """
    path = path or raw_csv_path()
    root = project_root(path.parent)
    cache_path = root / "data" / "processed" / "crashes_raw.parquet"

    if cache and cache_path.exists():
        frame = pd.read_parquet(cache_path)
    else:
        frame = pd.read_csv(
            path,
            encoding="utf-8-sig",  # rule 1: BOM support
            low_memory=False,
            keep_default_na=False,  # rule 4: keep blank / "Null" / "Unknown" distinct
            na_values=[],
            dtype=str,
        )
        for column in NUMERIC_COLUMNS:
            if column in frame.columns:
                frame[column] = pd.to_numeric(frame[column], errors="coerce")
        if cache:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(cache_path, index=False)

    validate(frame)
    return frame


def validate(frame: pd.DataFrame) -> None:
    """Assert the structural expectations recorded in spec section 2."""
    if frame.shape[1] != EXPECTED_COLUMNS:
        raise ValueError(f"Expected {EXPECTED_COLUMNS} columns, found {frame.shape[1]}")
    missing = [c for c in REQUIRED_COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")
    if frame["X"].isna().any() or frame["Y"].isna().any():
        raise ValueError("Coordinates must be present for every crash record")


def add_severity_flags(frame: pd.DataFrame) -> pd.DataFrame:
    """Add the serious-or-fatal indicator used by the target and history features."""
    frame = frame.copy()
    frame["is_severe"] = frame["crashSeverity"].isin(SEVERE_LABELS).astype("int8")
    frame["crashYear"] = frame["crashYear"].astype("int16")
    return frame


def valid_speed_limit(series: pd.Series) -> pd.Series:
    """True where speedLimit is a multiple of 10 between 10 and 110 (spec 5.8 rule 6)."""
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.isin(VALID_SPEED_LIMITS)


def valid_lane_count(series: pd.Series) -> pd.Series:
    """True where NumberOfLanes is an integer from 1 to 8 (spec 5.8 rule 6)."""
    numeric = pd.to_numeric(series, errors="coerce")
    return numeric.isin(VALID_LANE_COUNTS)
