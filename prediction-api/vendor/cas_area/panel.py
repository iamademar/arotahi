"""Eligible cell-year panel and targets (spec 4, 5.3).

Eligibility (lag-0): a cell is eligible for target year t when it recorded at
least one crash in years t-5 to t-1. The target is 1 when the cell records any
serious or fatal crash during year t.
"""

from __future__ import annotations

import pandas as pd

LOOKBACK_YEARS = 5
FIRST_TARGET_YEAR = 2011
LAST_TARGET_YEAR = 2025  # 2026 is partial and excluded (spec 5.10)

# A cell with fewer than this many prior crashes in the lookback window is
# marked low-history. Note: the term history_sufficiency does not appear in
# spec_v2.md; it is a plan.md addition, defined explicitly here so the
# threshold is auditable rather than implied.
LOW_HISTORY_CRASH_THRESHOLD = 3


def cell_year_counts(frame: pd.DataFrame) -> pd.DataFrame:
    """Crashes and severe crashes per cell per year: the base for everything else."""
    return (
        frame.groupby(["cell_id", "crashYear"], observed=True)
        .agg(crash_count=("is_severe", "size"), severe_count=("is_severe", "sum"))
        .reset_index()
    )


def _window(counts: pd.DataFrame, start: int, end: int) -> pd.DataFrame:
    """Aggregate cell counts over the inclusive year range [start, end]."""
    slice_ = counts[(counts["crashYear"] >= start) & (counts["crashYear"] <= end)]
    return (
        slice_.groupby("cell_id", observed=True)
        .agg(
            prior_crash_count=("crash_count", "sum"),
            prior_severe_count=("severe_count", "sum"),
            prior_years_with_crash=("crashYear", "nunique"),
        )
        .reset_index()
    )


def build_panel(
    frame: pd.DataFrame,
    first_year: int = FIRST_TARGET_YEAR,
    last_year: int = LAST_TARGET_YEAR,
    lookback: int = LOOKBACK_YEARS,
) -> pd.DataFrame:
    """One row per eligible cell-year, with the target and history sufficiency.

    ``frame`` must already carry ``cell_id`` and ``is_severe``.
    """
    counts = cell_year_counts(frame)
    rows = []

    for target_year in range(first_year, last_year + 1):
        prior = _window(counts, target_year - lookback, target_year - 1)
        prior = prior[prior["prior_crash_count"] > 0]  # eligibility: at least one crash

        outcome = counts[counts["crashYear"] == target_year][["cell_id", "severe_count"]]
        panel_year = prior.merge(outcome, on="cell_id", how="left")
        panel_year["target"] = (panel_year["severe_count"].fillna(0) > 0).astype("int8")
        # Carried for count-target experiments. Evaluation always uses the binary
        # ``target``; this is a training signal only, and never a predictor.
        panel_year["target_severe_count"] = panel_year["severe_count"].fillna(0).astype("int16")
        panel_year["target_year"] = target_year
        rows.append(panel_year.drop(columns=["severe_count"]))

    panel = pd.concat(rows, ignore_index=True)
    panel["history_sufficiency"] = (
        panel["prior_crash_count"] < LOW_HISTORY_CRASH_THRESHOLD
    ).map({True: "low", False: "sufficient"})
    return panel


def severe_cells_by_year(frame: pd.DataFrame) -> pd.DataFrame:
    """All cells recording a serious or fatal crash in each year, eligible or not."""
    severe = frame[frame["is_severe"] == 1]
    return severe.groupby(["crashYear", "cell_id"], observed=True).size().rename("n").reset_index()


def coverage_table(frame: pd.DataFrame, panel: pd.DataFrame) -> pd.DataFrame:
    """Per-year eligible counts, prevalence and eligible coverage.

    Eligible coverage is the share of the year's serious/fatal cells that were
    in the eligible population, and is the headline limitation of the product:
    cells newly active in year t cannot be scored at all.
    """
    severe = severe_cells_by_year(frame)
    out = []

    for target_year, group in panel.groupby("target_year"):
        eligible_ids = set(group["cell_id"])
        severe_ids = set(severe[severe["crashYear"] == target_year]["cell_id"])
        positives = int(group["target"].sum())
        covered = len(severe_ids & eligible_ids)
        out.append(
            {
                "target_year": int(target_year),
                "eligible_cells": len(group),
                "positive_cells": positives,
                "prevalence": positives / len(group) if len(group) else 0.0,
                "severe_cells_all": len(severe_ids),
                "eligible_coverage": covered / len(severe_ids) if severe_ids else 0.0,
                "low_history_share": float((group["history_sufficiency"] == "low").mean()),
            }
        )
    return pd.DataFrame(out)
