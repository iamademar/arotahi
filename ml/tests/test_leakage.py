"""Mandatory leakage tests.

A feature for target year t must be computable before year t begins. These
tests are the safeguard that makes the backtest meaningful.
"""

from __future__ import annotations

import pandas as pd
import pytest

from cas_area import features, panel


@pytest.fixture(scope="module")
def built(prepared: pd.DataFrame):
    frame = panel.build_panel(prepared, first_year=2015, last_year=2020)
    return prepared, frame, features.build_features(prepared, frame)


def test_no_feature_uses_target_year_or_later(built):
    """(a) Dropping every record from year >= t must not change year t's features."""
    prepared, panel_frame, full = built

    for target_year in (2018, 2020):
        panel_year = panel_frame[panel_frame["target_year"] == target_year]
        past_only = prepared[prepared["crashYear"] < target_year]

        from_full = features.build_features(prepared, panel_year)
        from_past = features.build_features(past_only, panel_year)

        columns = features.predictor_columns(from_full)
        left = from_full.sort_values("cell_id").reset_index(drop=True)[columns]
        right = from_past.sort_values("cell_id").reset_index(drop=True)[columns]
        pd.testing.assert_frame_equal(left, right, check_dtype=False)


def test_target_uses_only_target_year(built):
    """(b) The target reflects serious/fatal crashes in year t and nothing else."""
    prepared, panel_frame, _ = built

    for target_year in (2017, 2019):
        panel_year = panel_frame[panel_frame["target_year"] == target_year].set_index("cell_id")
        severe_in_year = set(
            prepared[(prepared["crashYear"] == target_year) & (prepared["is_severe"] == 1)]["cell_id"]
        )
        expected = panel_year.index.isin(severe_in_year).astype(int)
        assert (panel_year["target"].to_numpy() == expected).all()


def test_shifting_target_year_crashes_leaves_features_unchanged(built):
    """(c) Moving target-year crashes far into the future changes no feature."""
    prepared, panel_frame, _ = built
    target_year = 2019
    panel_year = panel_frame[panel_frame["target_year"] == target_year]

    shifted = prepared.copy()
    mask = shifted["crashYear"] == target_year
    assert mask.any(), "fixture must contain target-year crashes for this test to bite"
    shifted.loc[mask, "crashYear"] = target_year + 50

    baseline = features.build_features(prepared, panel_year)
    moved = features.build_features(shifted, panel_year)

    columns = features.predictor_columns(baseline)
    pd.testing.assert_frame_equal(
        baseline.sort_values("cell_id").reset_index(drop=True)[columns],
        moved.sort_values("cell_id").reset_index(drop=True)[columns],
        check_dtype=False,
    )


def test_identifiers_are_never_predictors(built):
    """Spec 5.7: identifiers and raw coordinates must not reach the model."""
    _, _, full = built
    banned = {"cell_id", "X", "Y", "OBJECTID", "crashYear", "crashFinancialYear", "target"}
    assert not banned & set(features.predictor_columns(full))


def test_history_sufficiency_is_not_a_predictor(built):
    """history_sufficiency is carried for reporting only."""
    _, _, full = built
    assert "history_sufficiency" in full.columns
    assert "history_sufficiency" not in features.predictor_columns(full)


def test_no_region_variant_drops_geography():
    """The memorisation check must actually remove region and TLA."""
    frame = pd.DataFrame(
        {"cell_id": ["a"], "target": [0], "target_year": [2020],
         "history_sufficiency": ["low"], "region": ["Waikato Region"],
         "tla": ["Hamilton City"], "crash_count_5y": [3]}
    )
    columns = features.predictor_columns(frame, include_geography=False)
    assert "region" not in columns and "tla" not in columns
    assert "crash_count_5y" in columns


def test_target_severe_count_is_never_a_predictor(built):
    """The count target is a training signal, not an input."""
    _, panel_frame, full = built
    assert "target_severe_count" in panel_frame.columns
    assert "target_severe_count" not in features.predictor_columns(full)
    assert "target_severe_count" not in features.predictor_columns(
        full, include_geography=False)


def test_neighbour_features_respect_the_temporal_cut(built):
    """Neighbour aggregation must not reach into the target year either."""
    prepared, panel_frame, _ = built
    target_year = 2019
    panel_year = panel_frame[panel_frame["target_year"] == target_year]

    shifted = prepared.copy()
    mask = shifted["crashYear"] == target_year
    assert mask.any()
    shifted.loc[mask, "crashYear"] = target_year + 50

    baseline = features.build_features(prepared, panel_year, include_neighbours=True)
    moved = features.build_features(shifted, panel_year, include_neighbours=True)

    neighbour_columns = [c for c in baseline.columns if c.startswith("neighbour_")]
    assert neighbour_columns, "neighbour features must be present when enabled"
    columns = features.predictor_columns(baseline)
    pd.testing.assert_frame_equal(
        baseline.sort_values("cell_id").reset_index(drop=True)[columns],
        moved.sort_values("cell_id").reset_index(drop=True)[columns],
        check_dtype=False,
    )
