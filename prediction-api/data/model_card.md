# Model card: cas-area-risk-1.0.0

## Recommended model

**gradient_boosted_calibrated**, version `cas-area-risk-1.0.0`.

gradient_boosted_calibrated beats the strongest non-ML baseline (baseline_recent_severe) on the primary metric in both locked test years, with bootstrap intervals excluding zero on both, and clears the Waikato guardrail.

## Leaderboard comparison

| Model | Primary 2024 | Primary 2025 | Waikato Recall@50 2024 | PR-AUC 2024 | Brier 2024 |
|---|---:|---:|---:|---:|---:|
| gradient_boosted_calibrated (recommended) | 0.2623 | 0.2795 | 0.1379 | 0.3677 | 0.0590 |
| gradient_boosted (runner-up) | 0.2628 | 0.2807 | 0.1422 | 0.3775 | 0.1571 |
| baseline_recent_severe (strongest baseline) | 0.2193 | 0.1929 | 0.1034 | n/a | n/a |

The primary metric is the mean within-region Recall@5% on the locked test year, excluding
regions with fewer than 100 eligible cells.

## The bootstrap interval that justified the decision

Paired cell-level bootstrap, 1,000 seeded resamples, difference in the primary metric against
the strongest non-ML baseline (baseline_recent_severe):

- 2024: +0.0430, 95% interval [+0.0229, +0.0720], excludes zero: True
- 2025: +0.0866, 95% interval [+0.0528, +0.1069], excludes zero: True

The Waikato guardrail (Recall@50 on 2024 at or above the recent-severe-count baseline) is
met.

## Geographic memorisation

The gradient-boosted model trained without region and TLA scores
0.2560 on the
primary metric for 2024, against 0.2623 with geography: a difference of
+0.0062. The model is therefore not relying on memorised geography; almost all of
its performance comes from crash history and road context. Region and TLA are retained because
they carry a small genuine signal, but the model would remain usable without them.

## Headline limitation: eligible coverage

Eligible coverage was 85.2% in 2024 and 86.0% in 2025. Roughly one in seven
cells that recorded a serious or fatal crash was **not** in the eligible population, because it
had no recorded crash in the preceding five years. The model cannot see those cells at all.
This is a property of the eligibility rule, not of the model, and no amount of model improvement
addresses it. Cells outside the eligible population must be shown as "not scored", never as low
risk.

## Calibration

Brier score on locked test 2024: 0.0590. Calibration is isotonic, fitted on
pooled out-of-fold predictions from the 2019 to 2023 expanding-window folds; no locked test
outcome was used. Calibration reduced the Brier score by roughly two thirds relative to the raw
model while leaving the ranking essentially unchanged, so the published probabilities can be
read as probabilities rather than as scores. The calibration curve tracks the diagonal closely
across the probability range, with the usual widening in the sparse top decile.

## Where the model is weakest

From the subgroup splits on 2024, the weakest subgroup is
**prior_crash_band = 11-20** (Recall@5% 0.051 across
1,010 cells at 17.62% prevalence). Low-history cells are
harder in general: with fewer than three prior crashes there is little for the history features
to work with. Users should treat the ranking as least reliable there.

## What to run next

Not run in this notebook; listed for the next iteration.

- lag-1 configuration, to score a year before its data is complete
- 500 m and 2 km grid resolutions, to test sensitivity to cell size
- eligibility thresholds of 1, 3 and 5 prior crashes, and windows of 5, 10 and all years
- grid-edge instability: how much a cell's rank moves when the grid origin is shifted

## Limitations

This model prioritises **recurring crash areas within an eligible population**. It is not
exposure-adjusted whole-network road risk: it has no traffic volume, no network geometry and no
segment identifiers, so a cell with many crashes and heavy traffic is not distinguished from an
intrinsically dangerous one. It is not causal, and it is not an engineering recommendation. It
identifies where to look, not what to build.

## Reproducibility

- Source snapshot: `Crash_Analysis_System__CAS__data.csv.csv`, SHA-256 `967a34b12525d369cd2e406d52b529bb81bae2f0cceb5fdd37d62d714368490e`
- Grid version: `nztm-1km-origin0-v1`
- Feature schema: `cas-area-features-1.0.0`
- Random seed: `20250831`
- TuiML runs: see `outputs/tuiml_run_log.md`
