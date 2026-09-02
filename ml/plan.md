# CAS recurring crash-area notebooks

## Context

You are building two Jupyter notebooks for the **NZ Recurring Crash Area Prioritisation Assistant**, following the attached specification `spec_v2.md` (CAS-only product and model spec, version 2.0). Read the spec first. Where this prompt and the spec disagree, the spec wins, except that this prompt narrows scope to what fits in two notebooks.

**Data:** `data/raw/Crash_Analysis_System__CAS__data.csv` (Crash Analysis System public snapshot, 705,609 rows, 72 columns, UTF-8 with BOM, `crashYear` 2006 to 2026, NZTM `X`/`Y` coordinates). Treat the file as immutable. Do not edit it; write everything derived to `data/processed/` or `outputs/`.

**Tools:** You have the TuiML MCP server available. Before writing any modelling code, list TuiML's tools and read their descriptions. Use TuiML for model training, evaluation and leaderboard generation wherever its tools fit the task. Where TuiML cannot do something the spec requires (custom temporal splits, ranking metrics at K, calibration on out-of-fold predictions, SHAP), do it locally in Python and say so in the notebook. Every notebook cell that calls TuiML must record the TuiML tool name and parameters used so the run is reproducible. Do not silently fall back to local training if a TuiML tool errors; report the error, then decide.

**Core prediction (spec section 1):** among 1 km NZTM grid cells that recorded at least one crash in the previous five complete calendar years, what is the probability that the cell records at least one serious or fatal crash in the next calendar year?

**Fixed conventions (spec sections 4, 5.2, 5.8):**
- Grid: origin (0, 0) in NZTM (EPSG:2193), 1 km cells by floor division, `cell_id = f"NZTM1K-{floor(X/1000)}-{floor(Y/1000)}"`.
- Eligibility: at least one crash in years t-5 to t-1 (lag-0). Cells with fewer than 3 prior crashes get `history_sufficiency = low` and are kept.
- Target: 1 if any crash in the cell during year t has `crashSeverity` in {"Serious Crash", "Fatal Crash"}, else 0.
- Cell `region` and `tla` are the modal value across all crash records in the cell, all years; tie-break by most recent crash then alphabetical; `Unknown` if none.
- `speedLimit` valid only if a multiple of 10 from 10 to 110; otherwise `invalid` with a quality flag. `NumberOfLanes` valid only for integers 1 to 8.
- 2026 is partial and is excluded from all training and evaluation.
- Never use `OBJECTID`, raw `X`/`Y`, `cell_id`, `crashYear`, `crashFinancialYear`, or any target-year field as a predictor.

**Style:** New Zealand English spelling. No em-dashes. Markdown cells explain what each section does and what the reader should take from it. Fix random seeds. Every notebook must run top to bottom with `jupyter nbconvert --execute` and all outputs saved.

**Project layout to create:**

```
notebooks/01_eda.ipynb
notebooks/02_modelling_leaderboard.ipynb
src/cas_area/          # shared code imported by both notebooks
  io.py                # load CSV, validate, snapshot manifest
  grid.py              # NZTM grid assignment, cell region/TLA
  panel.py             # eligible cell-year panel + targets
  features.py          # lookback feature builder
  metrics.py           # Recall@K, Precision@K, Lift@K, ceilings, coverage
tests/                 # pytest; leakage tests are mandatory
data/processed/        # parquet outputs
outputs/               # leaderboard.csv, model card, figures
requirements.txt
README.md
```

Put logic in `src/cas_area/` and keep notebooks as thin drivers so the modelling notebook does not re-implement the EDA notebook's code. Use pandas or polars plus pyarrow; the file is 200 MB so avoid repeated full reloads (cache the cleaned frame as parquet after the first load).

---

## Task 1: `notebooks/01_eda.ipynb` (Exploratory Data Analysis)

Build an EDA notebook that reproduces and extends the audit in spec section 2. Structure it as follows.

**1. Setup and snapshot manifest**
- Load the CSV with BOM handling. Compute and print a snapshot manifest: filename, size in bytes, SHA-256, row count, column count, min and max `crashYear`. Save it to `data/processed/snapshot_manifest.json`.
- Assert 72 columns and that all required columns exist (`X`, `Y`, `crashYear`, `crashSeverity`, `region`, `tlaName`, `speedLimit`, `NumberOfLanes`, `urban`, `crashSHDescription`, `holiday`, `weatherA`, `weatherB`, `light`, `roadSurface`, `roadworks`, `slipOrFlood`, `pedestrian`, `bicycle`, `motorcycle`, `truck`, `bus`, `schoolBus`).

**2. Schema and missingness audit**
- Table of every column: dtype, non-null count, missing count, missing share, distinct values, and the top 5 values for categoricals.
- For every categorical field, count blank, literal `"Null"`, and `"Unknown"` separately (spec 5.8 rule 4). Highlight `weatherB` and `holiday` where the spec gives specific semantics. Confirm the four holiday labels.
- `speedLimit` and `NumberOfLanes`: list all distinct values with counts; flag those outside the validity sets; report how many rows become `invalid`.
- Compare your numbers against the spec section 2 missingness table and print a reconciliation table (expected vs observed, pass/fail).

**3. Target and year coverage**
- Severity distribution table with counts and percentages; reconcile with spec (Non-Injury 485,478; Minor 172,686; Serious 41,263; Fatal 6,182).
- Rows per `crashYear`, plotted as a bar chart, with 2026 visibly marked as partial. Note the 2020 dip and the 29k to 42k range as context for the relative-volume features in spec 5.6.
- Serious/fatal share by year.

**4. Geography**
- `X`/`Y` ranges, missing counts, unique coordinate pairs after rounding to 1 m.
- Assign every crash to a 1 km cell using `src/cas_area/grid.py`. Report occupied cell counts (all years) and reconcile with the spec (35,329 at 1 km; also compute 500 m and expect 61,971).
- Unit test in `tests/`: every crash maps to exactly one cell, and the mapping is deterministic.
- Crashes per cell distribution (histogram, log scale) and a simple national scatter or hexbin of cell centroids shaded by crash count. A regional bar chart of crash counts.
- Cell-level region/TLA assignment under the modal rule. Report how many cells have crashes from more than one region (spec says 34 eligible cells in the 2025 panel) and how many resolved by tie-break.

**5. Road context, conditions and road users**
- Distributions of `urban`, `speedLimit` (valid only), `NumberOfLanes`, `roadCharacter`, `roadLane`, `roadSurface`, `trafficControl`, `streetLight`, `light`, `weatherA`, `weatherB`, `crashSHDescription`.
- Serious/fatal rate by `urban`, by valid `speedLimit` band, by `light`, by state-highway flag, by region. Present as tables plus one or two charts.
- Road-user involvement shares (`pedestrian`, `bicycle`, `motorcycle`, `truck`, `bus`, `schoolBus`, `moped`) and serious/fatal rate when each is involved.
- Brief note on which collision-object fields have high missingness and are excluded from the first model (spec 5.7).

**6. Eligible panel preview**
- Using `src/cas_area/panel.py`, build the lag-0 eligible cell-year panel for target years 2011 to 2025 and report per year: eligible cells, positive cells, prevalence, and eligible coverage (`|S/F cells in t ∩ eligible(t)| / |S/F cells in t|`).
- Reconcile 2024 and 2025 against the spec coverage table (2024: 21,396 eligible, 85.2% coverage, 7.77% prevalence; 2025: 21,183 eligible, 86.0% coverage, 7.95% prevalence).
- Regenerate the Waikato 2025 reference counts under the grid-level region rule and report them next to the spec's crash-level figures (3,681 eligible / 238 positive) with the difference explained.
- Share of eligible cells with `history_sufficiency = low` (spec expects about 43% for 2025).
- Save the panel to `data/processed/panel_1km_lag0.parquet`.

**7. Summary for the modelling notebook**
- A closing markdown cell listing: what reconciled with the spec, what did not and why, data-quality issues that affect feature design, and the exact files the modelling notebook should read.

---

## Task 2: `notebooks/02_modelling_leaderboard.ipynb` (Model training, leaderboard, recommendation)

Build the modelling notebook. It reads `data/processed/panel_1km_lag0.parquet` and the cleaned crash frame; it does not repeat EDA.

**1. Feature engineering (spec 5.5 and 5.6)**
- Implement `src/cas_area/features.py`. For each eligible cell-year (target year t, lag-0), compute features from years t-1, t-3 to t-1, and t-5 to t-1 only:
  - Crash-frequency history: counts over 1/3/5 years, years with a crash in the 5-year window, year-over-year trend, most recent prior crash year, years since last crash, share of lookback years with a crash, relative volume (cell count as a share of the national total and of the cell's region total for each lookback year).
  - Severity history: fatal, serious, minor, non-injury counts over 1/3/5 years; serious/fatal count and share; years since last serious/fatal crash; ever-serious/fatal flag.
  - Road context: modal `urban` and share, modal and median valid `speedLimit` plus invalid share, modal `NumberOfLanes` plus invalid share, modal `roadCharacter`, `roadLane`, `roadSurface`, `trafficControl`, `streetLight`, state-highway share, region, TLA.
  - Crash conditions: dark, wet-weather, wet/unsealed-surface, holiday (non-blank `holiday`), roadworks, slip/flood counts and shares.
  - Road users: pedestrian, bicycle, motorcycle, truck, bus/school-bus counts and shares.
  - Data quality: records used, missing region/TLA share, invalid speed and lane share, unknown/null/blank share, distinct coordinates in cell.
- `history_sufficiency` is carried on every row but is never a predictor.
- Save a feature dictionary (`outputs/feature_dictionary.csv`: name, group, source columns, lookback window, type, missing rule) and the feature matrix to `data/processed/features_1km_lag0.parquet`.
- **Mandatory leakage tests in `tests/test_leakage.py`:** (a) no feature for target year t uses any crash with `crashYear >= t`; (b) the target uses only `crashYear == t`; (c) shifting all target-year crashes out of the data leaves every feature unchanged. The notebook runs `pytest tests -q` in a cell and shows the output.

**2. Temporal split (spec 5.10)**
- Training target years 2011 to 2022. Validation target year 2023. Locked test 1: 2024. Locked test 2: 2025. No 2026.
- Expanding-window folds for tuning: train on 2011 to v-1, predict v, for v in 2019 to 2023. Hyperparameters chosen on the mean primary metric across folds.
- Fit all encoding, imputation and calibration on training and validation years only. Print the split table in the notebook.

**3. Baselines (spec 5.9), implemented before any ML model**
1. Random ranking (seeded).
2. Recent severe-count: rank by serious/fatal crashes in t-5 to t-1.
3. Smoothed severe-share: (S/F count + a) / (all count + b) with documented a and b.

**4. Candidate ML models (spec 5.9)**
- Weighted logistic regression, random forest, gradient-boosted trees (LightGBM or XGBoost; use TuiML's implementation if it offers one).
- Class weighting only. No SMOTE. Never rebalance validation or test years.
- Also train the gradient-boosted model **without** region and TLA to check for geographic memorisation (spec 5.7).
- Train through TuiML where its tools support it. Record TuiML run IDs or artefact paths in the notebook and in `outputs/`.

**5. Calibration and explanation (spec 5.13)**
- Calibrate the selected model type (Platt or isotonic) on pooled out-of-fold predictions from the 2019 to 2023 folds. Never use 2024 or 2025 outcomes for calibration.
- TreeSHAP for tree models, coefficient × standardised value for logistic regression. Show the top five contributions for three example cells (highest-ranked Waikato cell, a `history_sufficiency = low` cell, a false negative), each labelled with its feature group.

**6. Evaluation (spec 5.11)**
- Implement `src/cas_area/metrics.py` with Recall@K, Precision@K, Lift@K, their ceilings `min(1, K/positives)` and `positives captured / K`, PR-AUC, ROC-AUC, Brier score, and eligible coverage.
- **Primary metric:** mean within-region Recall@5% on locked test 2024, excluding regions with fewer than 100 eligible cells.
- **Guardrail:** Waikato Recall@50 on 2024 >= recent-severe-count baseline.
- Report for every model on validation 2023, test 2024 and test 2025: the primary metric, Recall@25/50/100 in Waikato (with ceilings), Recall@1%/5%/10% nationally and per region, precision and lift at the same capacities, PR-AUC, ROC-AUC, Brier.
- Splits by `history_sufficiency`, by prior-serious/fatal flag, by urban/open road, and by prior-crash-count band, at least for the top two models and the strongest baseline.
- Calibration curve for the selected model on 2024 (from pooled OOF calibration; do not refit on 2024).
- Accuracy must not appear as a selection metric anywhere.

**7. Leaderboard**
- Build a leaderboard DataFrame with one row per model (including baselines and the no-region variant) and columns: model, trained via (TuiML tool or local), primary metric 2024, primary metric 2025, Waikato Recall@50 2024 (with ceiling), guardrail pass, national Recall@5% 2024, PR-AUC 2024, Brier 2024, plus the same for 2025. Sort by primary metric 2024 descending.
- Compute a cell-level bootstrap (1,000 resamples, seeded) 95% interval on the difference in the primary metric between each ML model and the strongest non-ML baseline, on both 2024 and 2025. Add the interval and whether it excludes zero to the leaderboard.
- Save as `outputs/leaderboard.csv` and display it in the notebook. If TuiML has its own leaderboard artefact, save that alongside and show both.

**8. Deployment decision and model recommendation (write this as a report section)**
- Apply the spec 5.11 decision rule exactly: an ML model is recommended only if it beats the strongest non-ML baseline on the primary metric on both 2024 and 2025, with a bootstrap interval that excludes zero on both, and passes the Waikato guardrail. Otherwise recommend the baseline and say so plainly.
- Write a markdown report section titled **"Recommended model"** containing:
  - The recommended model, its version string (`cas-area-risk-1.0.0`), and the one-line reason it was chosen.
  - The leaderboard row for the recommended model and for the runner-up and the strongest baseline, side by side.
  - The bootstrap interval that justified the decision.
  - Whether the no-region model performed materially differently and what that implies about geographic memorisation.
  - Eligible coverage for 2024 and 2025, stated as the headline limitation (roughly 85 to 86% of serious/fatal cells were eligible; the rest are newly active cells the model cannot see).
  - Calibration quality (Brier and a sentence on the curve).
  - Where the model is weakest from the subgroup splits.
  - What to run next (lag-1 configuration, 500 m and 2 km resolution, eligibility threshold 1/3/5 and window 5/10/all, grid-edge instability). Do not run these in this notebook; list them.
  - The limitation statement from spec section 3: recurring crash areas within an eligible population, not exposure-adjusted whole-network road risk, not causal, not an engineering recommendation.
- Also save the same content as `outputs/model_card.md`, and save frozen 2024 and 2025 backtest scores for the recommended model to `outputs/scores_{year}_1km_lag0.parquet` with columns `cell_id, target_year, probability, national_percentile, regional_percentile, national_rank, regional_rank, history_sufficiency, actual_outcome, model_version, grid_version, feature_schema_version, source_snapshot_id`.

---

## Definition of done

- Both notebooks execute cleanly from a fresh kernel via `jupyter nbconvert --to notebook --execute` and are saved with outputs.
- `pytest tests -q` passes, including the leakage tests and the one-cell-per-crash grid test.
- `outputs/leaderboard.csv`, `outputs/model_card.md`, `outputs/feature_dictionary.csv`, `data/processed/snapshot_manifest.json`, and the two backtest score files exist.
- `README.md` explains how to run everything, which TuiML tools were used and for what, and where each spec section is implemented.
- Every number that the spec gives as a reconciliation check is either matched or the discrepancy is explained in the notebook.