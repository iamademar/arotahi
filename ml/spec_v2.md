# NZ Recurring Crash Area Prioritisation Assistant

## CAS-Only Product and Model Specification

**Status:** Revised after auditing `Crash_Analysis_System_(CAS)_data(1).csv`  
**Data scope:** The supplied 705,609-row CAS public CSV only  
**Geographic scope:** New Zealand, with a Waikato pilot  
**Primary user:** Road-safety and transport-data analysts  
**Primary decision:** Which previously observed crash areas should be shortlisted for closer review?

---

## 1. Revision decision

The supplied dataset does not support the road-segment forecasting model described in the previous specification without additional data.

It contains crash points and crash attributes, but it does not contain:

- a complete road network;
- stable road-segment identifiers;
- road areas with no reported crashes;
- Annual Average Daily Traffic or another exposure measure;
- road geometry away from crash points;
- historical road-attribute snapshots; or
- exact crash dates within a calendar year.

The revised application therefore uses fixed geographic crash areas instead of road segments.

### Revised core prediction

> Among 1 km grid cells that recorded at least one crash during the previous five complete calendar years, what is the probability that a cell will record at least one serious or fatal crash in the next calendar year?

This is a **recurring crash-area forecast**. It is not a whole-road-network risk model.

### Why this is supportable

The CSV provides:

- complete `X` and `Y` crash coordinates;
- complete `crashYear` values from 2006 to 2026;
- complete `crashSeverity` labels;
- regional and territorial-authority attributes;
- road-environment and crash-condition fields; and
- enough history to create yearly area-level training examples.

Negative examples can be created for an eligible grid cell when it had recent crash history but no serious/fatal crash during the target year.

---

## 2. Audited dataset

### Source

```text
File: Crash_Analysis_System_(CAS)_data(1).csv
Size: 199,339,426 bytes
SHA-256: 967a34b12525d369cd2e406d52b529bb81bae2f0cceb5fdd37d62d714368490e
Rows: 705,609
Columns: 72
```

The schema matches the public CAS feature layer and field descriptions:

- https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/CAS_Data_Public/FeatureServer/0
- https://opendata-nzta.opendata.arcgis.com/pages/cas-data-field-descriptions

### Target distribution

| Recorded severity | Rows | Percentage |
|---|---:|---:|
| Non-Injury Crash | 485,478 | 68.80% |
| Minor Crash | 172,686 | 24.47% |
| Serious Crash | 41,263 | 5.85% |
| Fatal Crash | 6,182 | 0.88% |
| **Serious or fatal** | **47,445** | **6.72%** |

### Calendar-year coverage

| Year | Rows | Status for this project |
|---:|---:|---|
| 2006 | 39,778 | Complete historical input |
| 2007 | 41,661 | Complete historical input |
| 2008 | 39,535 | Complete historical input |
| 2009 | 38,247 | Complete historical input |
| 2010 | 36,870 | Complete historical input |
| 2011 | 32,450 | Complete historical input/target |
| 2012 | 30,443 | Complete historical input/target |
| 2013 | 30,109 | Complete historical input/target |
| 2014 | 29,784 | Complete historical input/target |
| 2015 | 32,104 | Complete historical input/target |
| 2016 | 37,250 | Complete historical input/target |
| 2017 | 39,314 | Complete historical input/target |
| 2018 | 38,470 | Complete historical input/target |
| 2019 | 36,931 | Complete historical input/target |
| 2020 | 32,820 | Complete historical input/target |
| 2021 | 34,156 | Complete historical input/target |
| 2022 | 31,252 | Complete historical input/target |
| 2023 | 31,511 | Validation candidate |
| 2024 | 29,334 | Locked test candidate |
| 2025 | 29,017 | Second locked test candidate; still subject to CAS revision |
| 2026 | 14,573 | Partial; exclude from training and evaluation |

### Geographic coverage

```text
Missing X: 0
Missing Y: 0
X range: 1,166,279 to 2,465,388.4035
Y range: 4,721,798.0738 to 6,190,024
Unique coordinate pairs after rounding to one metre: 530,901
Occupied 1 km grid cells across all years: 35,329
Occupied 500 m grid cells across all years: 61,971
```

The coordinates are suitable for assigning crash records to a fixed grid in New Zealand Transverse Mercator coordinates. The model should use coordinates for grid assignment, not as direct numerical predictors in the first experiment.

### Key missingness

| Field | Missing rows | Treatment |
|---|---:|---|
| `X` | 0 | Grid assignment only |
| `Y` | 0 | Grid assignment only |
| `crashYear` | 0 | Time split and aggregation |
| `crashSeverity` | 0 | Historical aggregate and target |
| `region` | 2,824 | Infer from modal prior records where possible; otherwise Unknown |
| `tlaName` | 140 | Infer from modal prior records where possible; otherwise Unknown |
| `crashSHDescription` | 138 | Unknown |
| `speedLimit` | 1,562 | Missing/invalid category plus quality flag |
| `weatherB` | 3,736 | Normalise blanks separately from literal `Null` |
| injury-count fields | 112 each | Not needed for area target |

### Important structural limitations

1. The file has `crashYear` and `crashFinancialYear`, but no exact calendar date or timestamp.
2. Forecasts must therefore use complete calendar years rather than arbitrary rolling 12-month windows.
3. Road conditions are observed only at places and times where a crash was recorded.
4. No exposure denominator is available, so the app cannot estimate per-vehicle or per-journey risk.
5. A grid cell may contain more than one road, an intersection, parallel carriageways, or non-road land.
6. Cells with no recent recorded crash are outside the eligible population and must not be given a reassuring low-risk score.

---

## 3. Product definition

### Product name

**NZ Recurring Crash Area Prioritisation Assistant**

### Product purpose

Help an analyst reduce thousands of historically active crash areas to a capacity-limited review queue for further investigation.

### Exact product claim

> The app ranks previously observed crash areas by their estimated probability of recording at least one serious or fatal Police-reported crash in the next calendar year, based only on earlier CAS records.

### Not claimed

The application does not estimate:

- the probability that a crash occurs on every road in New Zealand;
- risk per vehicle, kilometre, trip, or resident;
- the risk of a cell with no recent crash record;
- the severity of an already-reported crash;
- the exact date or time of a future crash;
- which individual road inside a cell is responsible for the score;
- why a crash will happen;
- the causal effect of changing speed, lighting, or another road feature; or
- which engineering intervention should be implemented.

### Primary use case

An analyst preparing an annual crash-pattern review selects:

```text
Forecast year: 2025
Region: Waikato
Review capacity: 50 recurring crash areas
Eligibility: at least one reported crash during 2020–2024
```

The app ranks eligible 1 km cells using data from 2020–2024. The analyst inspects the highest-ranked areas, examines their historical crash patterns, adds appropriate areas to a shortlist, records notes, and exports a review brief.

For the 2025 Waikato backtest, the audited file produces approximately:

```text
Eligible 1 km cells: 3,681
Cells with a serious/fatal crash in 2025: 238
Positive rate: 6.47%
```

Nationally, the same 2025 setup produces:

```text
Eligible 1 km cells: 21,183
Cells with a serious/fatal crash in 2025: 1,684
Positive rate: 7.95%
```

These are reproducibility checks for the grid-building pipeline, not final model-performance results.

---

## 4. Scope

### MVP scope

- Use only `Crash_Analysis_System_(CAS)_data(1).csv` as model data.
- Cover all New Zealand recurring crash areas, with Waikato as the initial interface preset.
- Use 1 km square NZTM grid cells as the prediction unit.
- Use a five-complete-calendar-year lookback.
- Predict whether an eligible cell records at least one serious/fatal crash in the next calendar year.
- Precompute probabilities and rankings in a versioned batch.
- Provide forecast/backtest overview, ranked-area table, grid map, area detail, shortlist, export, and model-performance views.
- Show a prominent limitation that rankings apply only to historically observed crash areas.

### Eligibility rule

A cell is eligible for target year `t` if:

```text
reported_crash_count(cell, years t-5 through t-1) >= 1
```

The minimum prior-crash count should be configurable during model experiments, but the published MVP must use a single documented rule. Compare thresholds of at least 1, 3, and 5 prior crashes as a sensitivity analysis.

### Resolution rule

The primary resolution is 1 km. Before finalising it, compare 500 m, 1 km, and 2 km grids for:

- number of eligible cells;
- positive prevalence;
- grid-edge instability;
- model performance;
- interpretability on the map; and
- usefulness to an analyst.

The grid origin must be fixed and versioned. Cell definitions must not change between years.

### Future scope requiring additional data

A future road-segment product can add:

- national road-centreline geometry;
- stable segment identifiers;
- Annual Average Daily Traffic;
- historical speed limits;
- road geometry and asset characteristics;
- treatment history; and
- non-crash road periods across the complete network.

Only that extended version should be described as road-segment or exposure-adjusted risk prioritisation.

---

## 5. Required model

### 5.1 Model name

**Next-Calendar-Year Recurring Crash Area Model**

### 5.2 Prediction unit

One row represents:

```text
one fixed 1 km grid cell × one target calendar year
```

Required identifiers:

```text
grid_version
cell_id
target_year
lookback_start_year
lookback_end_year
feature_schema_version
```

Recommended cell identifier:

```text
NZTM1K-{floor(X/1000)}-{floor(Y/1000)}
```

Example:

```text
NZTM1K-1802-5814
```

### 5.3 Target

```text
serious_fatal_next_year = 1
    if at least one crash in the cell during target_year has
    crashSeverity equal to "Serious Crash" or "Fatal Crash"

serious_fatal_next_year = 0
    if the eligible cell has no serious/fatal crash during target_year
```

The target is defined at cell-year level. Multiple serious/fatal crashes still produce target `1` for the binary MVP.

### 5.4 Prediction output

```json
{
  "cell_id": "NZTM1K-1802-5814",
  "target_year": 2025,
  "lookback_years": [2020, 2021, 2022, 2023, 2024],
  "serious_fatal_event_probability": 0.126,
  "regional_percentile": 97.8,
  "regional_rank": 43,
  "eligible_population": "Cells with at least one reported crash in the previous five calendar years",
  "model_version": "cas-area-risk-1.0.0"
}
```

Probability comes from the model. Percentile and rank are computed after batch scoring within the documented eligible population.

### 5.5 Historical feature windows

For target year `t`, calculate features using only:

```text
t-1
t-3 through t-1
t-5 through t-1
```

No crash from target year `t` may enter any feature.

### 5.6 Feature groups

#### Crash-frequency history

- all-crash counts over 1, 3, and 5 years;
- years with at least one crash over the five-year lookback;
- year-over-year crash-count trend;
- most recent prior crash year;
- years since most recent prior crash; and
- proportion of five lookback years containing a crash.

#### Severity history

- prior fatal-crash counts over 1, 3, and 5 years;
- prior serious-crash counts over 1, 3, and 5 years;
- prior minor-crash counts over 1, 3, and 5 years;
- prior non-injury-crash counts over 1, 3, and 5 years;
- prior serious/fatal crash count and share;
- years since most recent serious/fatal crash; and
- whether the cell has ever recorded a serious/fatal crash during the lookback.

Using prior severity is not target leakage because it predates the forecast year. The implementation must prove this through year filters.

#### Road-context summaries observed in prior crashes

- modal `urban` value and share;
- modal `speedLimit`, median speed limit, and missing/invalid share;
- modal `NumberOfLanes` and missing/invalid share;
- modal `roadCharacter`;
- modal `roadLane`;
- modal `roadSurface`;
- modal `trafficControl`;
- modal `streetLight`;
- share of prior crashes marked as state highway by `crashSHDescription`;
- modal `region`; and
- modal `tlaName`.

These describe the historical crash records inside the cell. They are not complete measurements of every road in the cell.

#### Historical crash-condition summaries

- dark-crash count and share;
- wet-weather crash count and share;
- wet/unsealed surface count and share;
- holiday crash count and share where semantics are confirmed;
- roadworks crash count and share;
- slip/flood crash count and share; and
- heavy-rain, fog, frost, or strong-wind crash counts where sample size is sufficient.

Weather fields describe weather during previous crashes. They do not forecast next year's weather.

#### Historical road-user summaries

- pedestrian-involved crash count and share;
- bicycle-involved crash count and share;
- motorcycle-involved crash count and share;
- truck-involved crash count and share;
- bus/school-bus-involved crash count and share; and
- counts/shares for other vehicle categories with adequate coverage.

#### Data-quality features

- number of prior records used;
- missing `region` share;
- missing `tlaName` share;
- missing/invalid `speedLimit` share;
- missing/invalid `NumberOfLanes` share;
- proportion of categorical fields recorded as `Unknown`, `Null`, or blank; and
- number of distinct coordinates inside the cell.

### 5.7 Features excluded from the first model

- raw `OBJECTID`;
- `cell_id` as a predictor;
- raw `X` and `Y` as numerical predictors;
- target-year records of any kind;
- target-year severity or injury counts;
- raw `fatalCount`, `seriousInjuryCount`, and `minorInjuryCount`;
- `crashLocation1` and `crashLocation2` free text;
- `areaUnitID` and `meshblockId`;
- high-missingness collision-object fields until audited; and
- `crashFinancialYear`, because calendar year defines the experiment.

Region and TLA may be retained as broad geographic predictors. Compare a model without them to assess geographic memorisation.

### 5.8 Cleaning rules

1. Read the CSV as UTF-8 with BOM support.
2. Preserve the original file as an immutable source snapshot.
3. Convert `X`, `Y`, `crashYear`, numerical counts, `speedLimit`, and `NumberOfLanes` to validated numerical types.
4. Treat blank, `Null`, and `Unknown` as distinct during the initial audit.
5. Merge them only when the official field semantics justify it.
6. Flag implausible speed-limit and lane-count values rather than silently imputing them.
7. Calculate modal categories using deterministic tie-breaking.
8. Define percentage features with safe zero denominators.
9. Fit any imputation, encoding, scaling, or calibration only on training years.

### 5.9 Candidate models

Implement and compare:

1. **Random ranking baseline** — establishes chance performance.
2. **Recent severe-count baseline** — rank by serious/fatal crashes in the prior five years.
3. **Historical severe-share baseline** — prior serious/fatal crashes divided by all prior crashes, with smoothing.
4. **Weighted logistic regression** — interpretable machine-learning baseline.
5. **Random forest** — nonlinear comparison.
6. **Gradient-boosted trees** — primary performance candidate.

The selected model must beat the strongest non-ML baseline on the locked temporal test using the agreed review-capacity metric. If it does not, deploy the baseline rather than presenting a weaker ML model.

Do not use SMOTE in the first experiment. Prefer class weighting or algorithm-specific positive-class weighting. Never rebalance validation or test years.

### 5.10 Temporal split

With a five-year lookback, use:

| Partition | Target years | Feature years | Purpose |
|---|---:|---|---|
| Training and expanding-window tuning | 2011–2022 | Prior five years for each target | Fit pipeline and hyperparameters |
| Validation | 2023 | 2018–2022 | Select model and shortlist policy |
| Locked test 1 | 2024 | 2019–2023 | Primary future-year test |
| Locked test 2 | 2025 | 2020–2024 | Temporal robustness test |
| Excluded | 2026 | Not applicable | Partial outcome year |

The model can be retrained on data through 2025 to generate a 2026 demonstration score using 2021–2025 features, but this is not a clean prospective test because 2026 is already underway and the source snapshot was obtained later. Do not present it as a forecast frozen before 2026 began.

The first genuine prospective evaluation should freeze a future score before its target year and preserve the exact source snapshot used.

### 5.11 Evaluation metrics

The app produces a capacity-limited review list, so ranking metrics are primary:

1. Recall among the top 25, 50, and 100 areas in Waikato.
2. Recall among the top 1%, 5%, and 10% nationally and regionally.
3. Precision at the same capacities.
4. Lift at the same capacities.
5. PR-AUC.
6. Brier score and calibration curve.
7. ROC-AUC as a secondary metric.

Also report:

- target prevalence by year;
- results by region and TLA;
- urban/open-road subgroup results;
- state-highway-share bands;
- performance for cells with and without a prior serious/fatal crash;
- performance by prior-crash-count band;
- 500 m, 1 km, and 2 km resolution sensitivity; and
- comparison against all baselines.

Accuracy must not select the model.

### 5.12 Threshold and capacity policy

Do not use a universal probability threshold of `0.50`. Analysts select a review capacity.

Example:

```text
Eligible Waikato cells: 3,681
Review capacity: 50
Displayed queue: 50 highest model probabilities
```

Backtest mode must show how many actual positive cells were captured by the same capacity.

### 5.13 Calibration and explanation

- Calibrate probabilities using training/validation years only.
- Never use 2024 or 2025 outcomes to calibrate a model evaluated on those years.
- Show “factors contributing to this model score,” not causal explanations.
- Explanations may reference recent crash frequency, prior severe crashes, historical road-user involvement, and prior crash conditions.
- Do not provide a what-if control that changes one field and claims a safety effect.

### 5.14 Model acceptance criteria

The model is eligible for the app only when:

- the grid and cell IDs are deterministic;
- the audited 2025 panel counts reproduce within an explained tolerance;
- every feature is proven to come from years before its target;
- the target comes only from the target calendar year;
- the selected model beats the strongest simple baseline on the agreed locked-test ranking metric;
- calibration is reported;
- subgroup and resolution-sensitivity results are reported;
- every published score has source, grid, feature, and model versions; and
- the model card clearly limits the eligible population to historically observed crash areas.

---

## 6. Application requirements

### 6.1 Forecast/backtest selector

Controls:

- target year;
- mode: Backtest or Demonstration;
- region;
- TLA;
- urban/open-road history;
- state-highway history share;
- grid resolution for research comparison, with 1 km as default;
- eligibility threshold; and
- review capacity.

Always display:

- lookback years;
- eligible-cell definition;
- source snapshot;
- target-year status;
- model version;
- eligible-cell count; and
- whether outcomes are available.

### 6.2 Overview

Display:

- map of eligible grid cells;
- probability and percentile legend;
- ranked-area count;
- score distribution;
- historical target prevalence;
- coverage warning for areas without recent crash history; and
- a persistent non-causal interpretation notice.

Cells outside the eligible population should be shown as “not scored,” not low risk.

### 6.3 Prioritised areas table

Columns:

```text
Regional rank
Cell ID
Region
TLA
Predicted probability
Regional percentile
National percentile
Prior five-year crash count
Prior five-year serious/fatal count
Most recent prior crash year
Historical state-highway share
Data quality
Shortlist status
```

Requirements:

- synchronise table and map selection;
- sort and filter without recomputing scores;
- keep probability, percentile, prior counts, and actual outcome visually distinct;
- compare up to three cells; and
- allow add/remove shortlist actions.

### 6.4 Area detail

Display:

- 1 km cell boundary and centroid;
- street basemap for orientation, clearly marked as context rather than model data;
- prediction, percentile, and regional/national ranks;
- eligibility and lookback definition;
- five-year crash timeline;
- historical severity composition;
- historical road-user and crash-condition summaries;
- modal road-context fields from previous crash records;
- factors contributing to the score;
- missingness and low-sample warnings;
- model input snapshot;
- analyst notes; and
- shortlist control.

The interface must not imply that every road inside the cell has the same risk.

### 6.5 Backtest mode

Flow:

1. Select 2023, 2024, or 2025.
2. Load scores built only from earlier calendar years.
3. Display the ranked queue without initially requiring target outcomes.
4. Allow the analyst to reveal actual target-year serious/fatal cells.
5. Show Recall@K, Precision@K, Lift@K, and missed positive cells.

Target-year crashes must not appear on the map, timeline, feature summary, or explanation until outcomes are revealed.

### 6.6 Shortlist

Users can:

- add/remove cells;
- record selection rationale;
- assign a review status;
- record follow-up questions;
- preserve the score and model version at selection time; and
- export the shortlist.

Statuses:

```text
Not reviewed
Desktop review
Additional road data required
Engineering review proposed
Do not progress
```

The analyst decision must remain distinct from the model ranking.

### 6.7 Export

Provide CSV and PDF/HTML exports containing:

- target year and lookback years;
- eligible-population definition;
- filters and review capacity;
- ranked and analyst-selected cells;
- cell maps and historical summaries;
- score, percentile, and prior counts;
- model, feature, grid, and source versions;
- relevant backtest metrics;
- data limitations; and
- a statement that the result is not exposure-adjusted road risk or an engineering recommendation.

### 6.8 Model performance

Display:

- training, validation, and test target years;
- target prevalence;
- Recall@K, Precision@K, Lift@K, PR-AUC, ROC-AUC, and Brier score;
- calibration plot;
- yearly and subgroup results;
- resolution sensitivity;
- baseline comparison;
- feature list;
- model version history;
- permitted and prohibited uses; and
- source coverage and revision caveats.

---

## 7. UX content

### Recommended terminology

Use:

- recurring crash area;
- eligible cell;
- estimated probability;
- next calendar year;
- reported serious/fatal crash;
- prioritised for review;
- factors contributing to the model score; and
- analyst shortlist.

Avoid:

- dangerous road;
- high-risk road segment;
- this road will have a crash;
- safe area;
- accident hotspot unless the organisation explicitly uses and defines that term;
- cause or caused by; and
- recommended intervention.

### Persistent notice

> This score applies only to grid cells with recent reported crash history. It estimates whether the cell will record at least one serious or fatal Police-reported crash in the stated calendar year, based only on earlier CAS records. It is not adjusted for traffic exposure, does not score every road, and does not establish causes or replace engineering assessment.

### Accessibility

- Meet WCAG 2.2 AA where practicable.
- Do not use colour alone to encode scores.
- Provide the ranked table as the keyboard-accessible alternative to the map.
- Provide text summaries for charts.
- Use New Zealand English.

---

## 8. Technical architecture

### Front end

- React;
- TypeScript;
- Vite;
- MapLibre GL JS or equivalent;
- chart library with accessible fallbacks; and
- query/cache library for API state.

### Backend

- FastAPI;
- Python;
- Postgres/PostGIS for a durable multi-user deployment; or
- DuckDB/Parquet plus precomputed GeoJSON for a single-user research prototype.

### Model and data pipeline

- immutable CAS CSV snapshot;
- schema and data-quality validation;
- deterministic NZTM grid assignment;
- cell-year feature builder;
- temporal model training/backtesting;
- probability calibration;
- batch scoring; and
- versioned export of scores, explanations, metrics, and model card.

### Data flow

```text
CAS CSV snapshot
  -> schema and value validation
  -> NZTM grid assignment
  -> eligible cell-year panel
  -> lookback feature aggregation
  -> target-year label construction
  -> temporal model training/backtesting
  -> probability calibration
  -> batch scoring and ranking
  -> forecast database/files
  -> React analyst dashboard
```

### Batch scoring

The model should not run when a user clicks a cell. Generate and freeze one score set per:

```text
source_snapshot × grid_version × feature_schema × model_version × target_year
```

The UI queries those stored scores.

---

## 9. API outline

### Forecasts and backtests

```http
GET /api/runs
GET /api/runs/{run_id}
GET /api/runs/{run_id}/summary
GET /api/runs/{run_id}/areas
GET /api/runs/{run_id}/metrics
```

Area filters:

```text
region
tla
urban_context
minimum_state_highway_share
minimum_prior_crashes
minimum_data_quality
limit
offset
sort
```

### Area detail

```http
GET /api/runs/{run_id}/areas/{cell_id}
GET /api/areas/{cell_id}/history
GET /api/areas/{cell_id}/similar
```

### Models

```http
GET /api/models
GET /api/models/{model_version}
GET /api/models/{model_version}/metrics
GET /api/models/{model_version}/features
GET /api/models/{model_version}/card
```

### Shortlists

```http
POST   /api/shortlists
GET    /api/shortlists/{shortlist_id}
PATCH  /api/shortlists/{shortlist_id}
POST   /api/shortlists/{shortlist_id}/areas
PATCH  /api/shortlists/{shortlist_id}/areas/{cell_id}
DELETE /api/shortlists/{shortlist_id}/areas/{cell_id}
POST   /api/shortlists/{shortlist_id}/exports
```

---

## 10. Core entities

### CrashArea

```text
grid_version
cell_id
geometry
centroid_x
centroid_y
region
tla
```

### AreaYearFeatures

```text
cell_id
target_year
lookback_start_year
lookback_end_year
feature_schema_version
feature values
data quality flags
source_snapshot_id
```

### ModelVersion

```text
model_version
algorithm
training target years
validation target year
test target years
grid_version
feature_schema_version
calibration method
metrics
model card
created_at
```

### RunScore

```text
run_id
cell_id
target_year
probability
national_percentile
regional_percentile
national_rank
regional_rank
model_version
feature_snapshot_id
explanation
quality warnings
actual_outcome_if_backtest
```

### ShortlistEntry

```text
shortlist_id
cell_id
run_id
score_at_selection
model_version_at_selection
analyst_status
selection_reason
notes
created_at
updated_at
```

---

## 11. Quality controls

- Verify source file size and SHA-256 before processing.
- Fail on missing required columns.
- Preserve raw categorical values before normalisation.
- Version grid origin and resolution.
- Test that every crash maps to exactly one grid cell.
- Test for one output row per eligible cell-year.
- Test that every feature year is earlier than its target year.
- Test that target calculations use only the target calendar year.
- Reconcile target totals with raw crash records.
- Reproduce audited 2025 national and Waikato panel counts.
- Detect schema, category, and missingness drift.
- Keep published score batches immutable.
- Issue a new version when a source revision changes results.

---

## 12. MVP acceptance criteria

### Dataset

- The attached CSV is the only required model input.
- The pipeline verifies 705,609 rows and 72 columns for this snapshot.
- The partial 2026 records are excluded from training and evaluation.
- Coordinates, years, and severity labels reconcile with the audit.

### Panel

- Fixed 1 km cells are produced deterministically.
- Every row represents one eligible cell and one target year.
- Cells with no target-year serious/fatal crash receive target `0`.
- Cells without lookback eligibility are absent or explicitly marked not scored.
- 500 m and 2 km sensitivity results are documented.

### Model

- Random, count, and smoothed-share baselines are implemented.
- Candidate ML models use the same temporal partitions.
- The deployed method beats the agreed baseline or the baseline is deployed.
- Recall, precision, and lift at analyst review capacities are reported.
- Probability calibration and subgroup results are reported.
- The model card states the eligible-population and exposure limitations.

### Application

- Users can choose year, region, TLA, and review capacity.
- The map and table show the same ranked cells.
- Non-eligible cells are not displayed as low risk.
- Target-year outcomes are hidden from forecast features and forecast-mode evidence.
- Users can inspect, shortlist, annotate, and export cells.
- Every score and export includes the source, grid, feature, and model versions.
- No wording presents a grid-cell score as a deterministic or causal road-safety conclusion.

---

## 13. Delivery phases

### Phase 0 — CAS-only feasibility

- Reproduce the dataset audit.
- Build 500 m, 1 km, and 2 km panels.
- Reproduce annual eligible-cell and positive-cell counts.
- Audit literal `Null`, blank, and `Unknown` values.
- Establish deterministic cleaning and aggregation rules.

**Output:** Audited, versioned cell-year dataset and feature dictionary.

### Phase 1 — Baselines and model

- Implement random, recent-count, and smoothed-share baselines.
- Train weighted logistic regression, random forest, and gradient-boosted trees.
- Run expanding temporal validation.
- Evaluate 2024 and 2025 separately.
- Select resolution and method.
- Calibrate probabilities.
- Generate model card and frozen backtest scores.

**Output:** Reproducible training pipeline, evaluation report, and scored cell-year files.

### Phase 2 — Read-only dashboard

- Build run selector, map, table, area detail, backtest, and model-performance views.
- Load precomputed scores and geometries.
- Add interpretation and coverage notices.

**Output:** Analyst can inspect and compare recurring crash areas.

### Phase 3 — Review workflow

- Add shortlist, notes, statuses, comparison, and exports.
- Conduct usability review with a transport or road-safety analyst.

**Output:** End-to-end annual crash-area review workflow.

### Phase 4 — Prospective evaluation

- Freeze a future-year score before the target year begins, allowing for CAS reporting lag.
- Preserve the exact source snapshot and model version.
- Record analyst selections without changing the frozen scores.
- Evaluate outcomes after the target year and data-lag window closes.

**Output:** Genuine prospective technical and workflow evaluation.

---

## 14. Instructions for the modelling agent

1. Use `Crash_Analysis_System_(CAS)_data(1).csv` as the only required input.
2. Verify the expected file hash, row count, column count, year range, coordinate completeness, and severity distribution.
3. Exclude 2026 because it is partial.
4. Construct fixed NZTM square grids at 500 m, 1 km, and 2 km.
5. Use floor-based grid assignment with a fixed, versioned origin.
6. Create one row per eligible cell per target year.
7. Define eligibility only from the prior five complete calendar years.
8. Construct every feature only from years earlier than the target year.
9. Construct the target only from the target year.
10. Add unit tests that fail if a target-year record appears in a feature aggregation.
11. Do not use `OBJECTID`, raw coordinates, cell ID, or target-year injury fields as predictors.
12. Save a feature dictionary describing calculation, source columns, lookback, type, missing-value rule, and temporal availability.
13. Implement simple baselines before machine-learning models.
14. Use expanding temporal validation and locked 2024/2025 tests.
15. Evaluate ranking at realistic analyst capacities, not accuracy alone.
16. Compare results with and without region/TLA predictors.
17. Compare grid resolutions and eligibility thresholds.
18. Calibrate probabilities without using locked-test outcomes.
19. Generate batch scores, explanations, metrics, and a model card.
20. State that the model ranks recurring crash areas and is not exposure-adjusted whole-network road risk.

---

## 15. Final app description

> The NZ Recurring Crash Area Prioritisation Assistant uses earlier Crash Analysis System records to rank 1 km areas with recent crash history by their estimated probability of recording at least one serious or fatal reported crash in the next calendar year. It helps analysts choose a manageable set of recurring crash areas for further review. It does not score every road, adjust for traffic exposure, establish causes, or replace engineering assessment.

