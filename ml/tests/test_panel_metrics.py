"""Panel construction and ranking-metric tests (spec 5.3, 5.11)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from cas_area import metrics, panel


def test_panel_has_one_row_per_eligible_cell_year(prepared: pd.DataFrame):
    frame = panel.build_panel(prepared, first_year=2015, last_year=2020)
    assert not frame.duplicated(["cell_id", "target_year"]).any()


def test_eligibility_requires_a_prior_crash(prepared: pd.DataFrame):
    frame = panel.build_panel(prepared, first_year=2015, last_year=2020)
    assert (frame["prior_crash_count"] >= 1).all()


def test_partial_year_is_excluded(prepared: pd.DataFrame):
    frame = panel.build_panel(prepared)
    assert frame["target_year"].max() <= 2025


def test_low_history_threshold_is_explicit(prepared: pd.DataFrame):
    frame = panel.build_panel(prepared, first_year=2018, last_year=2020)
    low = frame["history_sufficiency"] == "low"
    assert (frame.loc[low, "prior_crash_count"] < panel.LOW_HISTORY_CRASH_THRESHOLD).all()
    assert (frame.loc[~low, "prior_crash_count"] >= panel.LOW_HISTORY_CRASH_THRESHOLD).all()


def test_recall_at_k_perfect_ranking():
    y = np.array([1, 1, 0, 0, 0])
    scores = np.array([0.9, 0.8, 0.1, 0.05, 0.01])
    assert metrics.recall_at_k(y, scores, 2) == 1.0
    assert metrics.precision_at_k(y, scores, 2) == 1.0


def test_recall_at_k_worst_ranking():
    y = np.array([1, 1, 0, 0, 0])
    scores = np.array([0.01, 0.05, 0.9, 0.8, 0.7])
    assert metrics.recall_at_k(y, scores, 2) == 0.0


def test_ceilings_bound_the_achievable_score():
    y = np.array([1] * 10 + [0] * 90)
    assert metrics.recall_ceiling_at_k(y, 5) == 0.5   # K < positives
    assert metrics.recall_ceiling_at_k(y, 20) == 1.0  # K > positives
    assert metrics.precision_ceiling_at_k(y, 20) == 0.5


def test_lift_is_one_for_uninformative_scores():
    rng = np.random.default_rng(0)
    y = np.concatenate([np.ones(100), np.zeros(900)])
    scores = np.full(1000, 0.5)  # all tied
    lift = metrics.lift_at_k(y, scores, 100)
    assert 0.5 < lift < 1.6  # tie-break is random, so near chance


def test_within_region_recall_skips_small_regions():
    frame = pd.DataFrame(
        {
            "region": ["Big"] * 200 + ["Tiny"] * 10,
            "target": [1] * 20 + [0] * 180 + [1] * 2 + [0] * 8,
            "score": list(np.linspace(1, 0, 200)) + list(np.linspace(1, 0, 10)),
        }
    )
    result = metrics.within_region_recall(frame, "score", fraction=0.05)
    assert "Big" in result.index and "Tiny" not in result.index


def test_primary_metric_rewards_a_better_ranking():
    rng = np.random.default_rng(3)
    n = 600
    target = rng.binomial(1, 0.08, n)
    frame = pd.DataFrame(
        {
            "region": ["A"] * 300 + ["B"] * 300,
            "target": target,
            "good": target + rng.normal(0, 0.15, n),  # correlated with the outcome
            "bad": rng.normal(0, 1, n),
        }
    )
    assert metrics.primary_metric(frame, "good") > metrics.primary_metric(frame, "bad")


def test_k_from_fraction_is_at_least_one():
    assert metrics.k_from_fraction(10, 0.01) == 1
    assert metrics.k_from_fraction(1000, 0.05) == 50
