# Improvement backlog

Ordered by expected value. Work one idea per iteration: implement behind a flag,
run `cv_objective`, keep only if the objective improves, revert otherwise.
Record every outcome in `RESULTS.md`, including failures.

**Objective:** mean primary metric over expanding-window folds validating on
2019-2023. Baseline **0.2673**. Target **0.32** (gap +0.0527).

**Never score 2024 or 2025 during the search.** `objective.assert_no_locked_years`
enforces this; do not weaken or bypass it.

## Why these four

The model captures only 34% of the ranking ceiling (0.262 achieved against 0.766
attainable at 5% capacity). Weakness is concentrated in sparse regions: West Coast
24%, Southland 24%, Marlborough 26% of their ceilings, against Auckland's 75%.

Logistic regression scores 0.2610 against LightGBM's 0.2623. A linear model nearly
matching boosted trees means the ceiling is in the **features and the target**, not
the estimator. Adding model families would waste the budget; these four change what
the model sees and what it is asked to predict.

---

## Track 1: count target

**Hypothesis.** The binary target discards information. A cell with 4 severe crashes
and one with 1 are both `1`, so the model cannot learn that the first is a worse
site. Training on counts should sharpen the ranking even though the ranking is
evaluated against the same binary outcome.

**Change.** Carry `severe_count` for the target year through `panel.build_panel`,
add a Poisson-objective factory in `modelling.py`, rank by expected count.
Evaluation stays binary: only the training signal changes.

**Confirms it.** Objective rises. **Kills it.** No movement, meaning severe-crash
counts in a single year are too sparse (most positive cells have exactly 1) to carry
extra signal.

**Watch for.** `cv_objective(target_column=...)` must still score against the binary
`target`, or the comparison is meaningless.

---

## Track 2: neighbour features

**Hypothesis.** Cells are scored in isolation, but risk does not stop at a 1 km
boundary. A quiet cell beside a dangerous corridor currently looks identical to a
quiet cell in empty country.

**Change.** For each cell, aggregate crash and severe-crash history over the 8
adjacent cells using `grid.cell_indices`. Extends `features.build_features`.

**Confirms it.** Objective rises, especially on sparse regions. **Kills it.** No
movement, meaning the 1 km cell already captures the relevant spatial scale.

**Watch for.** Neighbour features must obey the same t-5..t-1 window.
`test_no_feature_uses_target_year_or_later` must still pass; if it fails, the
neighbour aggregation is reaching into the target year.

**Bonus.** This is the principled fix for grid-edge instability, listed as future
work in the model card.

---

## Track 3: hierarchical smoothing

**Hypothesis.** Cells with 1-2 prior crashes have history features that are mostly
noise, and they dominate the sparse regions where the model is furthest from its
ceiling. Shrinking their rates toward a stable group mean should help exactly there.

**Change.** Empirical-Bayes shrinkage of per-cell severe rates toward TLA, then
region base rates. Shrinkage strength fitted on training folds only.

**Confirms it.** Objective rises, and the per-region breakdown shows sparse regions
closing on their ceilings. **Kills it.** Gain concentrated only in dense regions,
meaning the smoothing is not doing what it was meant to.

**Watch for.** Group means must come from training years only. Computing them over
all years leaks the target year.

---

## Track 4: eligibility window

**Hypothesis.** Coverage (85%) is the binding constraint, not model quality. 289 of
1,951 severe cells in 2024 were invisible because they had no crash in the prior
five years. A 10-year window would see some of them.

**Change.** Parameterise the lookback in `panel.build_panel`; rebuild the panel at
10 years.

**Confirms it.** Coverage rises **and** the objective holds or improves.
**Kills it.** Objective rises only because the eligible population is larger and more
diluted.

**This is a trade-off, not a free win.** Always report coverage next to the objective.
A metric gain bought by changing the denominator is not an improvement.

---

## Track 5 (last): hyperparameter search

Run only after the feature set settles. Tuning against features that are about to
change wastes the budget. Search over `modelling.expanding_folds()`. Expected gain
is modest (~+0.01); this is a top-up, not a strategy.
