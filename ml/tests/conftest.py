"""Shared fixtures. Tests run against a small synthetic frame by default so the
suite stays fast; the grid reconciliation test uses the real extract when present.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from cas_area import features, grid, io  # noqa: E402


@pytest.fixture(scope="session")
def synthetic_crashes() -> pd.DataFrame:
    """Deterministic synthetic CAS-shaped frame spanning 2006-2025."""
    rng = np.random.default_rng(11)
    n = 4000
    frame = pd.DataFrame(
        {
            "X": rng.integers(1_200_000, 1_260_000, n).astype(float),
            "Y": rng.integers(4_800_000, 4_860_000, n).astype(float),
            "crashYear": rng.integers(2006, 2026, n),
            "crashSeverity": rng.choice(
                ["Non-Injury Crash", "Minor Crash", "Serious Crash", "Fatal Crash"],
                n, p=[0.68, 0.25, 0.06, 0.01],
            ),
            "region": rng.choice(["Waikato Region", "Otago Region", ""], n, p=[0.6, 0.35, 0.05]),
            "tlaName": rng.choice(["Hamilton City", "Dunedin City"], n),
            "speedLimit": rng.choice(["50", "100", "999", ""], n, p=[0.5, 0.4, 0.05, 0.05]),
            "NumberOfLanes": rng.choice(["2", "4", "12", ""], n, p=[0.6, 0.3, 0.05, 0.05]),
            "urban": rng.choice(["Urban", "Open"], n),
            "crashSHDescription": rng.choice(["Yes", "No"], n),
            "holiday": rng.choice(["", "Christmas New Year", "Easter"], n, p=[0.9, 0.05, 0.05]),
            "weatherA": rng.choice(["Fine", "Light rain", "Null"], n),
            "weatherB": rng.choice(["Null", "Frost", ""], n),
            "light": rng.choice(["Bright sun", "Dark", "Overcast"], n),
            "roadSurface": rng.choice(["Sealed", "Wet", "Unsealed"], n),
            "roadworks": rng.choice(["0", "1"], n, p=[0.95, 0.05]),
            "slipOrFlood": rng.choice(["0", "1"], n, p=[0.98, 0.02]),
            "roadCharacter": rng.choice(["Nil", "Bridge"], n),
            "roadLane": rng.choice(["2-way", "1-way"], n),
            "trafficControl": rng.choice(["Nil", "Traffic Signals"], n),
            "streetLight": rng.choice(["Off", "On", "Null"], n),
        }
    )
    for column in features.ROAD_USER_COLUMNS:
        frame[column] = rng.choice(["0", "1"], n, p=[0.92, 0.08])
    return frame


@pytest.fixture(scope="session")
def prepared(synthetic_crashes: pd.DataFrame) -> pd.DataFrame:
    frame = io.add_severity_flags(synthetic_crashes)
    frame = grid.assign_cells(frame)
    return features.prepare_records(frame)


@pytest.fixture(scope="session")
def real_crashes() -> pd.DataFrame:
    """The real extract, skipped when it is not available."""
    try:
        path = io.raw_csv_path(ROOT)
    except FileNotFoundError:
        pytest.skip("Raw CAS extract not available")
    return io.load_raw(path)
