# NZ Recurring Crash Area Prioritisation Assistant: CAS-only pipeline

Two notebooks that audit the Crash Analysis System public snapshot, build an eligible
cell-year panel on a fixed 1 km NZTM grid, and train and evaluate models that rank grid
cells by the probability of recording a serious or fatal crash in the next calendar year.

The prediction: **among 1 km cells that recorded at least one crash in the previous five
complete calendar years, what is the probability that the cell records at least one
serious or fatal crash in the next calendar year?**

## Result

The calibrated gradient-boosted model is recommended. It beats the strongest non-ML
baseline (rank by serious/fatal crashes in the prior five years) on the primary metric in
both locked test years, with paired bootstrap intervals excluding zero on both, and it
clears the Waikato guardrail.

| Model | Primary 2024 | Primary 2025 | Brier 2024 |
|---|---:|---:|---:|
| gradient_boosted_calibrated (recommended) | 0.2623 | 0.2795 | 0.0590 |
| baseline_recent_severe (strongest baseline) | 0.2193 | 0.1929 | n/a |

The primary metric is the mean within-region Recall@5% on the locked test year, excluding
regions with fewer than 100 eligible cells.

Two findings matter more than the leaderboard:

- **Eligible coverage is the binding limitation**, not model quality. About 85 to 86% of
  cells that recorded a serious or fatal crash were in the eligible population. The rest
  are newly active cells the model cannot see by construction.
- **Calibration matters more than ranking here.** Isotonic calibration on out-of-fold
  predictions cut the Brier score from 0.157 to 0.059 while leaving the ordering
  essentially unchanged, which is what makes the published numbers readable as
  probabilities.

## Running it

```bash
python -m venv .venv                     # Python 3.11 (lightgbm and shap wheels)
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests -q      # 24 tests, including the leakage tests

cd notebooks
../.venv/bin/jupyter nbconvert --to notebook --execute --inplace 01_eda.ipynb
../.venv/bin/jupyter nbconvert --to notebook --execute --inplace 02_modelling_leaderboard.ipynb
```

Run the EDA notebook first: it writes the panel the modelling notebook reads. The first
load parses the 199 MB CSV and caches it as parquet, so later runs start in seconds.
End to end: about 20 seconds for the EDA notebook, about 3 minutes for the modelling one.

## Serving the model

The trained model is served by a standalone FastAPI service in `../prediction-api`,
a sibling of this project with its own virtual environment and a vendored copy of
`cas_area`. It does not read this project at runtime.

```bash
cd ../prediction-api
python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/export_serving_data.py   # copies data from here
.venv/bin/python scripts/train_and_save.py        # writes the model artefact
.venv/bin/uvicorn app.main:app
```

Re-run `export_serving_data.py` whenever the feature matrix or the source snapshot
changes here, then retrain. See `../prediction-api/README.md`.

## Layout

```
notebooks/01_eda.ipynb                  audit, grid, eligible panel
notebooks/02_modelling_leaderboard.ipynb  features, models, leaderboard, recommendation
src/cas_area/
  io.py          load, validate, snapshot manifest
  grid.py        NZTM grid assignment, modal region and TLA
  panel.py       eligible cell-year panel and targets
  features.py    lookback feature builder
  metrics.py     Recall/Precision/Lift@K, ceilings, coverage, bootstrap
  modelling.py   baselines, temporal splits, candidate models, calibration
  evaluation.py  leaderboard, subgroups, decision rule, score schema
tests/           pytest; the leakage tests are mandatory
experiments/     improvement search: objective, backlog, results log
data/raw/        immutable source snapshot, never written to
data/processed/  panel, features, frozen scores, manifest
outputs/         leaderboard, model card, feature dictionary, figures, TuiML log
spec_v2.md       the specification this implements
```

Logic lives in `src/cas_area/`; the notebooks are thin drivers, so the modelling notebook
never re-implements the EDA notebook's code.

## TuiML

TuiML was used to fit and cross-check the gradient-boosted and logistic candidates. Every
run, its parameters and its model id are recorded in `outputs/tuiml_run_log.md`.

The final models are fitted locally. This is a reported limitation, not a silent fallback:
`tuiml_predict` returns hard 0/1 class labels even with `return_proba: true`, and a
capacity-limited review list must rank every eligible cell by probability, so there is no
way to take a top 50 from binary labels. The cause was isolated rather than assumed by
reproducing TuiML's own random holdout locally (ROC-AUC 0.808 against its reported 0.584)
and by scoring its returned labels against the truth, which reproduces 0.570.

TuiML also offers no year-aware splitter, no ranking-at-K metrics, and no way to load its
saved artefact outside its own environment. So the split, the metrics, the calibration and
the model selection are all local; TuiML covers the estimator-fitting step.

| TuiML tool | Used for |
|---|---|
| `tuiml_list` | Enumerate classifiers and splitters |
| `tuiml_describe` | Check the LightGBM parameter schema |
| `tuiml_upload_data` | Register the 2011-2022 training panel |
| `tuiml_train` | Fit the gradient-boosted and logistic candidates |
| `tuiml_predict` | Score locked test 2024 (returned labels, not probabilities) |

## Where each spec section is implemented

| Spec | Implementation |
|---|---|
| 2 (audited dataset) | `01_eda.ipynb` sections 1 to 5; `io.snapshot_manifest` |
| 4 (grid, eligibility) | `grid.py`; `panel.build_panel` |
| 5.2 (prediction unit) | `grid.assign_cells`, `grid.cell_attributes` |
| 5.3 (target) | `panel.build_panel` |
| 5.5, 5.6 (features) | `features.build_features`; `outputs/feature_dictionary.csv` |
| 5.7 (exclusions) | `features.NON_PREDICTORS`, `features.predictor_columns` |
| 5.8 (cleaning) | `io.valid_speed_limit`, `io.valid_lane_count`, `grid.modal_label` |
| 5.9 (candidates) | `modelling.BASELINES`, `modelling.MODEL_FACTORIES` |
| 5.10 (temporal split) | `modelling.split_table`, `modelling.expanding_folds` |
| 5.11 (evaluation) | `metrics.py`; `evaluation.decide` |
| 5.13 (calibration, SHAP) | `modelling.fit_calibrator`; notebook 2 section 8 |
| 10 (RunScore schema) | `evaluation.score_frame` |
| 11 (quality controls) | `tests/`; the reconciliation tables in notebook 1 |

## Reconciliation with the spec

Matched exactly: SHA-256 and file size, 705,609 rows, 72 columns, all four severity counts,
35,329 occupied 1 km cells and 61,971 at 500 m, and both panel years (2024: 21,396 eligible,
85.2% coverage, 7.77% prevalence; 2025: 21,183, 86.0%, 7.95%).

Three figures in the build prompt are **reported rather than matched**, because they do not
appear in `spec_v2.md` at all:

- `history_sufficiency = low` is about 60% of 2025 eligible cells, not the 43% quoted.
  Neither the term nor the figure is in the spec. No reading of "fewer than 3 prior
  crashes" produces 43%: the window count gives 60.4%, years-with-a-crash gives 67.7%, and
  all-history gives 24.5%. The threshold used is stated explicitly in
  `panel.LOW_HISTORY_CRASH_THRESHOLD`.
- Cells spanning more than one region number 95 across all years (17 needing the
  tie-break), against the 34 quoted. Again absent from the spec.
- Waikato 2025 gives 3,679 eligible / 237 positive under the grid-level modal-region rule,
  against the spec's crash-level 3,681 / 238. Expected: the panel assigns one modal region
  per cell, so a boundary cell counts once rather than in both regions.

## Limitations

This ranks **recurring crash areas within an eligible population**. It is not
exposure-adjusted whole-network road risk: with no traffic volume, network geometry or
segment identifiers, a busy cell is not distinguished from an intrinsically dangerous one.
It is not causal and it is not an engineering recommendation. Cells outside the eligible
population must be shown as "not scored", never as low risk.
