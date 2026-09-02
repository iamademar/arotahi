"""Ranking and calibration metrics (spec 5.11).

The product produces a capacity-limited review list, so ranking metrics at a
review capacity K are primary. Accuracy is deliberately absent: it must never
select a model (spec 5.11).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

MIN_REGION_ELIGIBLE_CELLS = 100  # regions smaller than this are excluded from the primary metric


def _top_k_hits(y_true: np.ndarray, scores: np.ndarray, k: int, seed: int = 0) -> int:
    """Positives captured in the top K, breaking score ties reproducibly."""
    if k <= 0:
        return 0
    k = min(k, len(scores))
    rng = np.random.default_rng(seed)
    jitter = rng.random(len(scores))  # deterministic tie-break, seeded
    order = np.lexsort((jitter, -scores))
    return int(y_true[order[:k]].sum())


def recall_at_k(y_true, scores, k: int, seed: int = 0) -> float:
    y_true = np.asarray(y_true)
    positives = y_true.sum()
    if positives == 0:
        return float("nan")
    return _top_k_hits(y_true, np.asarray(scores, dtype=float), k, seed) / positives


def precision_at_k(y_true, scores, k: int, seed: int = 0) -> float:
    y_true = np.asarray(y_true)
    k_eff = min(k, len(y_true))
    if k_eff == 0:
        return float("nan")
    return _top_k_hits(y_true, np.asarray(scores, dtype=float), k, seed) / k_eff


def lift_at_k(y_true, scores, k: int, seed: int = 0) -> float:
    y_true = np.asarray(y_true)
    base = y_true.mean()
    if base == 0:
        return float("nan")
    return precision_at_k(y_true, scores, k, seed) / base


def recall_ceiling_at_k(y_true, k: int) -> float:
    """Best achievable Recall@K: min(1, K / positives)."""
    positives = np.asarray(y_true).sum()
    if positives == 0:
        return float("nan")
    return min(1.0, k / positives)


def precision_ceiling_at_k(y_true, k: int) -> float:
    """Best achievable Precision@K: min(positives, K) / K."""
    y_true = np.asarray(y_true)
    k_eff = min(k, len(y_true))
    if k_eff == 0:
        return float("nan")
    return min(int(y_true.sum()), k_eff) / k_eff


def k_from_fraction(n: int, fraction: float) -> int:
    """Review capacity as a fraction of the eligible population, at least one cell."""
    return max(1, int(np.ceil(n * fraction)))


def within_region_recall(
    frame: pd.DataFrame,
    score_column: str,
    fraction: float = 0.05,
    target_column: str = "target",
    region_column: str = "region",
    min_cells: int = MIN_REGION_ELIGIBLE_CELLS,
    seed: int = 0,
) -> pd.Series:
    """Recall@fraction computed inside each region separately.

    Regions are ranked against themselves, so a national model cannot score well
    simply by ordering regions by size.
    """
    out = {}
    for region, group in frame.groupby(region_column):
        if len(group) < min_cells:
            continue
        k = k_from_fraction(len(group), fraction)
        out[region] = recall_at_k(
            group[target_column].to_numpy(), group[score_column].to_numpy(), k, seed
        )
    return pd.Series(out, dtype=float).sort_index()


def primary_metric(
    frame: pd.DataFrame,
    score_column: str,
    fraction: float = 0.05,
    min_cells: int = MIN_REGION_ELIGIBLE_CELLS,
    seed: int = 0,
) -> float:
    """Mean within-region Recall@5%, excluding regions under the size floor.

    This is the model-selection metric. It is a plan.md refinement of spec 5.11
    rather than a spec-stated metric.
    """
    per_region = within_region_recall(
        frame, score_column, fraction=fraction, min_cells=min_cells, seed=seed
    )
    return float(per_region.mean()) if len(per_region) else float("nan")


def probability_metrics(y_true, probabilities) -> dict:
    """Threshold-free discrimination and calibration measures."""
    y_true = np.asarray(y_true)
    probabilities = np.asarray(probabilities, dtype=float)
    return {
        "pr_auc": float(average_precision_score(y_true, probabilities)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "brier": float(brier_score_loss(y_true, probabilities)),
    }


def capacity_report(
    frame: pd.DataFrame,
    score_column: str,
    target_column: str = "target",
    absolute_k: tuple[int, ...] = (25, 50, 100),
    fractions: tuple[float, ...] = (0.01, 0.05, 0.10),
    seed: int = 0,
) -> pd.DataFrame:
    """Recall, precision, lift and their ceilings at each review capacity."""
    y_true = frame[target_column].to_numpy()
    scores = frame[score_column].to_numpy()
    rows = []

    capacities = [(f"top {k}", k) for k in absolute_k]
    capacities += [(f"top {f:.0%}", k_from_fraction(len(frame), f)) for f in fractions]

    for label, k in capacities:
        rows.append(
            {
                "capacity": label,
                "k": k,
                "recall": recall_at_k(y_true, scores, k, seed),
                "recall_ceiling": recall_ceiling_at_k(y_true, k),
                "precision": precision_at_k(y_true, scores, k, seed),
                "precision_ceiling": precision_ceiling_at_k(y_true, k),
                "lift": lift_at_k(y_true, scores, k, seed),
            }
        )
    return pd.DataFrame(rows)


def bootstrap_primary_difference(
    frame: pd.DataFrame,
    score_a: str,
    score_b: str,
    n_resamples: int = 1000,
    fraction: float = 0.05,
    seed: int = 0,
    min_cells: int = MIN_REGION_ELIGIBLE_CELLS,
) -> dict:
    """Cell-level bootstrap 95% interval on primary_metric(a) - primary_metric(b).

    Resampling is done once over row positions and reused for both models, so
    the paired difference is measured on identical resamples.
    """
    rng = np.random.default_rng(seed)
    n = len(frame)
    observed = primary_metric(frame, score_a, fraction, min_cells) - primary_metric(
        frame, score_b, fraction, min_cells
    )

    # Pre-extract arrays; grouping by region code is far cheaper than pandas
    # groupby inside the resample loop.
    regions = frame["region"].to_numpy()
    codes, uniques = pd.factorize(regions)
    y = frame["target"].to_numpy()
    sa = frame[score_a].to_numpy(dtype=float)
    sb = frame[score_b].to_numpy(dtype=float)

    differences = np.empty(n_resamples, dtype=float)
    for i in range(n_resamples):
        idx = rng.integers(0, n, n)
        c, yy, aa, bb = codes[idx], y[idx], sa[idx], sb[idx]
        recalls_a, recalls_b = [], []
        for code in range(len(uniques)):
            mask = c == code
            size = int(mask.sum())
            if size < min_cells:
                continue
            k = k_from_fraction(size, fraction)
            yt = yy[mask]
            if yt.sum() == 0:
                continue
            recalls_a.append(recall_at_k(yt, aa[mask], k, seed=i))
            recalls_b.append(recall_at_k(yt, bb[mask], k, seed=i))
        differences[i] = (
            np.mean(recalls_a) - np.mean(recalls_b) if recalls_a else np.nan
        )

    valid = differences[~np.isnan(differences)]
    low, high = np.percentile(valid, [2.5, 97.5])
    return {
        "observed_difference": float(observed),
        "ci_low": float(low),
        "ci_high": float(high),
        "excludes_zero": bool(low > 0 or high < 0),
        "n_resamples": int(len(valid)),
    }
