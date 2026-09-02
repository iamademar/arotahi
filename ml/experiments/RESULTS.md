# Experiment log

Append-only. Every idea tried is recorded here, including the ones that failed:
negative results are most of the value, and they stop the same idea being retried.

**Objective:** mean primary metric over expanding-window folds validating on
2019-2023. **Target 0.32.** Locked test years 2024/2025 are never scored here.

| # | Idea | Objective | Delta | Kept | Note |
|---:|---|---:|---:|:--:|---|
| 0 | baseline: gradient_boosted, 178 features | 0.2673 | - | - | Starting point |
| 1 | Track 1: Poisson count target | 0.2762 | +0.0089 | yes | 4 of 5 folds improved |
| 2 | Track 2: 8-neighbour features | 0.2811 | +0.0049 | yes | all 5 folds improved |
| 3 | Track 3: empirical-Bayes smoothing | 0.2785 | -0.0026 | **no** | Reverted; helped sparse regions but not overall |
| 4 | Track 4: 10-year eligibility window | 0.2645 | -0.0083 | **no** | Trade-off: +4.6pp coverage, -0.0083 ranking |
| 5 | Track 5: hyperparameter search (6 configs) | 0.2811 | +0.0000 | n/a | Current params already optimal |

## Detail

### 0. Baseline

`gradient_boosted` with the 178-feature matrix, no changes.

```
objective 0.2673 | folds 2019:0.2877  2020:0.2331  2021:0.2524  2022:0.2692  2023:0.2942
```

Fold spread 0.2331 to 0.2942 is wide, so treat any gain under about 0.005 as noise
rather than signal.

### 1. Track 1 - Poisson count target (KEPT)

Trained LightGBM with a Poisson objective on `target_severe_count`, ranking by
expected count. Evaluation unchanged: still the binary `target`.

```
objective 0.2762 | delta +0.0089 | folds 2019:0.2927  2020:0.2478  2021:0.2641  2022:0.2832  2023:0.2932
```

Improved 4 of 5 folds; only 2023 was flat (-0.0010). The gain is largest on the
weakest folds (2020 +0.0147, 2021 +0.0117), which is the desirable shape - it lifts
the floor rather than the ceiling.

Kept: +0.0089 is above the ~0.005 noise floor implied by the fold spread.

Worth noting the ceiling on this idea: 84% of positive cells have exactly one severe
crash in the target year, so the count carries less extra information than it would
in a denser setting. The gain is real but this track is now spent.

### 2. Track 2 - neighbour features (KEPT)

Five features aggregating crash and severe-crash history over the 8 adjacent cells:
`neighbour_crash_count`, `neighbour_severe_count`, `neighbour_cells_active`,
`neighbour_severe_share`, `neighbour_mean_crashes`. Built on top of Track 1.

```
objective 0.2811 | delta +0.0049 | folds 2019:0.2934  2020:0.2526  2021:0.2715  2022:0.2861  2023:0.3019
```

Kept despite the delta sitting marginally under the ~0.005 noise floor, because
**every one of the five folds improved**. A gain that appears in all folds is signal;
the noise floor guards against a mean lifted by one lucky fold, which is not the
shape here.

`test_neighbour_features_respect_the_temporal_cut` was added first and passes, so the
neighbour aggregation inherits the same t-5..t-1 cut as every other feature.

Cumulative: 0.2673 -> 0.2811 (+0.0138). Remaining gap to target: +0.0389.

### 3. Track 3 - empirical-Bayes smoothing (REVERTED)

Two-level shrinkage of each cell's severe rate toward its TLA rate, then TLA toward
region. Group rates fitted on each fold's training rows only.

```
objective 0.2785 | delta -0.0026 | folds 2019:0.2960  2020:0.2511  2021:0.2639  2022:0.2779  2023:0.3037
```

**Reverted.** Hurt 3 of 5 folds.

The diagnosis is more useful than the headline. On 2023, per-region recall changed by
**+0.0056 on the five sparse regions the idea targeted** (Southland +0.028, Northland
+0.018, Otago +0.010) against **-0.0001 elsewhere**. So the hypothesis was
directionally correct - shrinkage does help low-count cells - but the effect is far
too small to survive the losses in Taranaki (-0.018) and Hawke's Bay (-0.013).

Why it likely failed: the gradient-boosted model already has `region` and `tla` as
features plus the full count history, so it can learn group base rates itself. The EB
columns are largely a smoothed restatement of information already present, and they
add four correlated features that dilute the split search.

**Do not retry as-is.** A variant worth one attempt later would apply shrinkage only
to cells with `history_sufficiency = low`, leaving well-observed cells untouched,
rather than shrinking everything.

### 4. Track 4 - 10-year eligibility window (REVERTED, but see the trade-off)

Eligibility relaxed from "at least one crash in t-5..t-1" to a 10-year window.

The naive comparison is confounded: a 10-year window needs 10 years of history, so
folds must start at 2016, giving fewer training years as well as a different
eligible population. Measured like-for-like on the **same restricted folds**:

```
 5-year window, folds 2016+ : 0.2728
10-year window, folds 2016+ : 0.2645   ->  -0.0083
```

Population effect over 2019-2023:

| Window | Mean eligible cells | Coverage | Prevalence |
|---|---:|---:|---:|
| 5-year | 21,563 | 86.5% | 7.81% |
| 10-year | 27,460 | **91.1%** | 6.46% |

**Reverted for the objective, but this is a real trade-off rather than a failure.**
The 10-year window buys **+4.6 percentage points of coverage** - it makes about 1,270
more severe cells per year visible to the model at all - at a cost of 0.0083 on the
ranking metric. The eligible population grows 27% and prevalence falls, so the same
5% capacity spreads over more cells and each individual ranking gets slightly harder.

Which is better depends on what the product is for, and that is a decision for the
user, not the search. If the goal is "miss fewer severe cells entirely", the 10-year
window is better despite the lower metric. Since the stated objective here is the
ranking metric, it is not adopted - but it should not be filed as a dead end.

### 5. Track 5 - hyperparameter search (NO GAIN)

Six configurations over the surviving feature set (count target + neighbours).

| num_leaves | lr | min_child | n_est | objective | delta |
|---:|---:|---:|---:|---:|---:|
| 31 | 0.05 | 30 | 400 | **0.2811** | current |
| 15 | 0.05 | 50 | 600 | 0.2804 | -0.0007 |
| 63 | 0.03 | 20 | 800 | 0.2752 | -0.0059 |
| 31 | 0.03 | 40 | 800 | 0.2751 | -0.0060 |
| 63 | 0.05 | 30 | 400 (reg) | 0.2744 | -0.0067 |
| 127 | 0.02 | 60 | 1000 | 0.2719 | -0.0092 |

**The existing parameters were already the best of the six.** Every
higher-capacity configuration did worse, and monotonically so: the more capacity
added, the larger the loss. That is the signature of a genuinely noisy target rather
than an under-fitted model, and it corroborates the earlier observation that logistic
regression nearly matches boosted trees here.

Tuning is not where the remaining headroom is.

---

## Search outcome

**Final objective 0.2811, against a target of 0.32.** Target not met; the search
ended on the stall condition after five tracks.

| Track | Delta | Kept |
|---|---:|:--:|
| 1. Poisson count target | +0.0089 | yes |
| 2. Neighbour features | +0.0049 | yes |
| 3. EB smoothing | -0.0026 | no |
| 4. 10-year window | -0.0083 | no (trade-off, see above) |
| 5. Hyperparameter search | +0.0000 | n/a |
| **Cumulative** | **+0.0138** | |

0.2673 -> 0.2811 is a **5.2% relative improvement**, from two changes that both alter
what the model sees or is asked to predict. The remaining gap to 0.32 is +0.0389.

**Why the target was not reached.** The three ideas that failed all failed in the
same direction: they added information the model could already infer (EB rates
restate group base rates it has via `region`/`tla`), or they changed the problem
rather than solving it (the 10-year window). Combined with tuning showing that extra
capacity actively hurts, the evidence points to a **noise ceiling** - single-year
severe crashes in a 1 km cell are close to a Poisson process, and much of the
remaining gap to a perfect ranking may be irreducible rather than learnable.

**Where remaining headroom most plausibly sits**, in rough order:
1. Exposure data (traffic volume). The single largest missing variable; the spec
   already names its absence as a structural limitation.
2. Multi-year targets - predicting "severe crash in the next 3 years" would be a far
   less noisy signal, though it changes the product question.
3. EB smoothing restricted to `history_sufficiency = low` cells only, per Track 3.

None of these is a tuning exercise, which is the real finding.


---

## Final confirmation on locked test years (run once)

Scored 2024 and 2025 exactly once, after the search ended. No re-tuning followed.

### The headline result: the CV gain did not transfer

Comparing like-for-like, both calibrated (the only genuinely deployable pair):

| | 2024 | 2025 |
|---|---:|---:|
| `original_calibrated` | 0.2559 | 0.2772 |
| `improved_calibrated` | 0.2583 | 0.2724 |
| Difference | **+0.0024** | **-0.0049** |

Against a CV improvement of **+0.0138**. The gain measured on folds 2019-2023
essentially **vanished on the locked years**: slightly positive on 2024, slightly
negative on 2025, both well inside noise.

**This is the most important result of the whole exercise, and it is a negative one.**
It is also exactly what the locked-test discipline exists to detect. Had the search
been allowed to select against 2024, the +0.0138 would have been reported as a real
improvement and it would have been wrong.

The honest reading: +0.0138 over five folds is within the range that fold-level noise
can produce. The fold spread was 0.2331-0.2942, so a mean shift of 0.014 was never
strongly separated from noise, and it did not replicate out of sample.

### Both models still beat the baseline decisively

| Model | Primary 2024 | Primary 2025 | Brier 2024 | vs baseline 2024 | vs baseline 2025 |
|---|---:|---:|---:|---|---|
| `improved_calibrated` | 0.2583 | 0.2724 | 0.0590 | +0.0390 [+0.0263,+0.0760] | +0.0795 [+0.0482,+0.1011] |
| `original_calibrated` | 0.2559 | 0.2772 | 0.0591 | +0.0366 [+0.0194,+0.0701] | +0.0843 [+0.0535,+0.1084] |
| `baseline_recent_severe` | 0.2193 | 0.1929 | n/a | - | - |

Intervals exclude zero on both years for both, so the ML-over-baseline finding is
robust. It is only the improvement *over the previous ML model* that failed to
replicate.

### Note on `improved_no_region`

It topped the raw 2024 table (0.2711) but is **not** recommended:

- Its lead over `improved_calibrated` is **not significant**: +0.0128
  [-0.0083, +0.0172] on 2024, and it **reverses** to -0.0043 on 2025.
- It ranks by expected count and emits no probabilities (Brier NaN), so it cannot
  satisfy spec 5.4.

A top-of-table finish that fails to replicate across years and cannot produce
calibrated probabilities is fold noise, not a better model.

### Recommendation

**`improved_calibrated`** - the count target plus neighbour features, isotonically
calibrated on pooled out-of-fold predictions. It is chosen for being calibrated and
marginally ahead on 2024, not because the improvement over the original was
demonstrated: on this evidence the two are equivalent, and either would be defensible.

The genuine, replicated finding remains ML over baseline (+0.039 and +0.080, both
intervals excluding zero), which was already established before this search began.
