"""Leaderboard assembly, subgroup splits and the deployment decision (spec 5.11).

The decision rule is deliberately strict: an ML model is only recommended when
it beats the strongest non-ML baseline on both locked test years, with a
bootstrap interval excluding zero on both, and passes the Waikato guardrail.
Otherwise the baseline is recommended.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import RANDOM_SEED
from .metrics import (
    capacity_report,
    k_from_fraction,
    primary_metric,
    probability_metrics,
    recall_at_k,
    recall_ceiling_at_k,
    within_region_recall,
)

WAIKATO = "Waikato Region"
GUARDRAIL_K = 50


def waikato_recall(frame: pd.DataFrame, score_column: str, k: int = GUARDRAIL_K) -> tuple[float, float]:
    """Waikato Recall@K and its ceiling: the primary use case in spec 3."""
    region = frame[frame["region"] == WAIKATO]
    if region.empty:
        return float("nan"), float("nan")
    y = region["target"].to_numpy()
    return (
        recall_at_k(y, region[score_column].to_numpy(), k),
        recall_ceiling_at_k(y, k),
    )


def evaluate_model(frame: pd.DataFrame, score_column: str, label: str, year: int) -> dict:
    """Every headline number for one model on one year."""
    y = frame["target"].to_numpy()
    scores = frame[score_column].to_numpy(dtype=float)
    national_k = k_from_fraction(len(frame), 0.05)
    wk_recall, wk_ceiling = waikato_recall(frame, score_column)

    row = {
        "model": label,
        "year": year,
        "primary_within_region_recall_5pct": primary_metric(frame, score_column),
        "national_recall_5pct": recall_at_k(y, scores, national_k),
        "waikato_recall_50": wk_recall,
        "waikato_recall_50_ceiling": wk_ceiling,
    }
    # Probability metrics only mean something for calibrated probabilities.
    if frame[score_column].between(0, 1).all():
        row.update(probability_metrics(y, scores))
    else:
        row.update({"pr_auc": np.nan, "roc_auc": np.nan, "brier": np.nan})
    return row


def subgroup_report(
    frame: pd.DataFrame, score_column: str, fraction: float = 0.05
) -> pd.DataFrame:
    """Where the model is strong and weak, by the splits the spec calls for."""
    rows = []

    def add(group_name: str, value, part: pd.DataFrame):
        if len(part) < 50 or part["target"].sum() == 0:
            return
        k = k_from_fraction(len(part), fraction)
        rows.append(
            {
                "split": group_name,
                "value": str(value),
                "cells": len(part),
                "positives": int(part["target"].sum()),
                "prevalence": float(part["target"].mean()),
                "recall_at_5pct": recall_at_k(
                    part["target"].to_numpy(), part[score_column].to_numpy(), k
                ),
            }
        )

    for value, part in frame.groupby("history_sufficiency"):
        add("history_sufficiency", value, part)

    prior_severe = frame["severe_count_5y"] > 0
    add("prior_serious_fatal", "yes", frame[prior_severe])
    add("prior_serious_fatal", "no", frame[~prior_severe])

    if "modal_urban" in frame.columns:
        for value, part in frame.groupby("modal_urban"):
            add("urban_or_open", value, part)

    bands = pd.cut(
        frame["crash_count_5y"], [-0.1, 2, 5, 10, 20, np.inf],
        labels=["1-2", "3-5", "6-10", "11-20", "20+"],
    )
    for value, part in frame.groupby(bands, observed=True):
        add("prior_crash_band", value, part)

    return pd.DataFrame(rows)


def calibration_curve_table(frame: pd.DataFrame, score_column: str, bins: int = 10) -> pd.DataFrame:
    """Predicted versus observed rate by probability decile."""
    quantiles = pd.qcut(frame[score_column], bins, duplicates="drop")
    out = (
        frame.groupby(quantiles, observed=True)
        .agg(
            cells=("target", "size"),
            mean_predicted=(score_column, "mean"),
            observed_rate=("target", "mean"),
        )
        .reset_index(drop=True)
    )
    return out


def decide(
    leaderboard: pd.DataFrame,
    ml_models: list[str],
    best_baseline: str,
    bootstrap: dict[str, dict],
) -> dict:
    """Apply the spec 5.11 decision rule exactly.

    ``bootstrap`` maps model label -> {2024: {...}, 2025: {...}}.
    """
    baseline_2024 = leaderboard.loc[
        (leaderboard["model"] == best_baseline) & (leaderboard["year"] == 2024),
        "primary_within_region_recall_5pct",
    ].iat[0]
    baseline_2025 = leaderboard.loc[
        (leaderboard["model"] == best_baseline) & (leaderboard["year"] == 2025),
        "primary_within_region_recall_5pct",
    ].iat[0]

    candidates = []
    for model in ml_models:
        rows = leaderboard[leaderboard["model"] == model].set_index("year")
        if 2024 not in rows.index or 2025 not in rows.index:
            continue
        m24 = rows.loc[2024, "primary_within_region_recall_5pct"]
        m25 = rows.loc[2025, "primary_within_region_recall_5pct"]
        guardrail = (
            rows.loc[2024, "waikato_recall_50"]
            >= leaderboard.loc[
                (leaderboard["model"] == best_baseline) & (leaderboard["year"] == 2024),
                "waikato_recall_50",
            ].iat[0]
        )
        boot = bootstrap.get(model, {})
        checks = {
            "beats_baseline_2024": bool(m24 > baseline_2024),
            "beats_baseline_2025": bool(m25 > baseline_2025),
            "interval_excludes_zero_2024": bool(boot.get(2024, {}).get("excludes_zero", False)),
            "interval_excludes_zero_2025": bool(boot.get(2025, {}).get("excludes_zero", False)),
            "waikato_guardrail": bool(guardrail),
        }
        candidates.append(
            {"model": model, "primary_2024": m24, "primary_2025": m25,
             "passes": all(checks.values()), **checks}
        )

    table = pd.DataFrame(candidates).sort_values("primary_2024", ascending=False)
    passing = table[table["passes"]] if len(table) else table

    if len(passing):
        recommended = passing.iloc[0]["model"]
        # The deployed model must emit calibrated probabilities (spec 5.4, 5.13).
        # Where a calibrated variant of the winner ranks identically, prefer it:
        # ranking is unchanged but the published probabilities become meaningful.
        calibrated = f"{recommended}_calibrated"
        if calibrated in set(passing["model"]):
            recommended = calibrated
        reason = (
            f"{recommended} beats the strongest non-ML baseline ({best_baseline}) on the "
            "primary metric in both locked test years, with bootstrap intervals excluding "
            "zero on both, and clears the Waikato guardrail."
        )
    else:
        recommended = best_baseline
        reason = (
            f"No ML model satisfied every condition of the spec 5.11 decision rule, so the "
            f"strongest non-ML baseline ({best_baseline}) is recommended for deployment."
        )

    return {
        "recommended": recommended,
        "is_ml": recommended != best_baseline,
        "reason": reason,
        "checks": table,
        "baseline": best_baseline,
    }


def score_frame(
    frame: pd.DataFrame,
    probabilities: np.ndarray,
    target_year: int,
    model_version: str,
    grid_version: str,
    feature_schema_version: str,
    source_snapshot_id: str,
) -> pd.DataFrame:
    """Frozen backtest scores in the schema spec 10 requires for RunScore."""
    out = pd.DataFrame(
        {
            "cell_id": frame["cell_id"].to_numpy(),
            "target_year": target_year,
            "probability": np.asarray(probabilities, dtype=float),
            "history_sufficiency": frame["history_sufficiency"].to_numpy(),
            "actual_outcome": frame["target"].to_numpy(),
            "region": frame["region"].to_numpy(),
        }
    )
    out["national_percentile"] = out["probability"].rank(pct=True)
    out["national_rank"] = out["probability"].rank(ascending=False, method="first").astype(int)
    out["regional_percentile"] = out.groupby("region")["probability"].rank(pct=True)
    out["regional_rank"] = (
        out.groupby("region")["probability"].rank(ascending=False, method="first").astype(int)
    )
    out["model_version"] = model_version
    out["grid_version"] = grid_version
    out["feature_schema_version"] = feature_schema_version
    out["source_snapshot_id"] = source_snapshot_id
    return out[
        [
            "cell_id", "target_year", "probability", "national_percentile",
            "regional_percentile", "national_rank", "regional_rank",
            "history_sufficiency", "actual_outcome", "model_version",
            "grid_version", "feature_schema_version", "source_snapshot_id",
        ]
    ]
