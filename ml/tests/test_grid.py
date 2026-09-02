"""Grid assignment tests (spec 11: one cell per crash, deterministic)."""

from __future__ import annotations

import pandas as pd

from cas_area import grid


def test_every_crash_maps_to_exactly_one_cell(prepared: pd.DataFrame):
    assert prepared["cell_id"].notna().all()
    assert len(prepared["cell_id"]) == len(prepared)


def test_mapping_is_deterministic(synthetic_crashes: pd.DataFrame):
    first = grid.assign_cells(synthetic_crashes)["cell_id"]
    second = grid.assign_cells(synthetic_crashes)["cell_id"]
    pd.testing.assert_series_equal(first, second)


def test_cell_id_format_and_floor_division():
    frame = pd.DataFrame({"X": [1_802_500.0, 999.0, 1_000.0], "Y": [5_814_200.0, 10.0, 0.0]})
    ids = grid.assign_cells(frame)["cell_id"].tolist()
    assert ids[0] == "NZTM1K-1802-5814"  # the worked example in spec 5.2
    assert ids[1] == "NZTM1K-0-0"
    assert ids[2] == "NZTM1K-1-0"


def test_boundary_coordinates_round_down():
    """A coordinate exactly on a boundary belongs to the upper cell."""
    frame = pd.DataFrame({"X": [1_000_000.0, 1_000_999.9], "Y": [5_000_000.0, 5_000_000.0]})
    ix = grid.assign_cells(frame)["cell_ix"].tolist()
    assert ix == [1000, 1000]


def test_modal_label_tie_break_prefers_most_recent(prepared: pd.DataFrame):
    """A 1-1 tie resolves to the label from the more recent crash year."""
    frame = pd.DataFrame(
        {
            "cell_id": ["c1", "c1"],
            "region": ["Otago Region", "Waikato Region"],
            "crashYear": [2010, 2020],
        }
    )
    result = grid.modal_label(frame, "region")
    assert result.loc[result["cell_id"] == "c1", "cell_region"].iat[0] == "Waikato Region"


def test_cells_with_no_usable_label_become_unknown():
    frame = pd.DataFrame({"cell_id": ["c1"], "region": [""], "crashYear": [2020]})
    result = grid.modal_label(frame, "region")
    assert result["cell_region"].iat[0] == "Unknown"


def test_reconciles_with_spec_cell_counts(real_crashes: pd.DataFrame):
    """Spec 2: 35,329 occupied 1 km cells and 61,971 at 500 m."""
    assert grid.occupied_cell_count(real_crashes, 1000) == 35_329
    assert grid.occupied_cell_count(real_crashes, 500) == 61_971
