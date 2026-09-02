# Prediction API

FastAPI service for the NZ Recurring Crash Area Prioritisation Assistant. It serves
a calibrated probability that a 1 km grid cell records a serious or fatal crash in a
target year, and the ranked review list the product is built around.

The model is `cas-area-risk-1.0.0` (`gradient_boosted_calibrated`), the model the
spec 5.11 decision rule recommended: primary metric 0.2622 on locked test 2024 and
0.2795 on 2025, against the strongest baseline's 0.2193 and 0.1929, with bootstrap
intervals excluding zero on both years.

## Layout

This service is standalone. It has its own virtual environment, its own data, and a
vendored copy of the `cas_area` library, so it runs with the `ml/` project absent.

```
crash_area_prioritisation_assistant/
  ml/                 modelling project (notebooks, training, tests)
  prediction-api/     this service
    app/              FastAPI application
    vendor/cas_area/  copy of the modelling library (see vendor/README.md)
    data/             exported parquet and outputs, ~19 MB
    models/           the saved model artefact
    scripts/          export and training entry points
```

## Setup

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt

# copy what the service needs from the modelling project (needs ../ml present)
.venv/bin/python scripts/export_serving_data.py

# fit the model and save the artefact
.venv/bin/python scripts/train_and_save.py

.venv/bin/uvicorn app.main:app --reload
```

Interactive docs at http://127.0.0.1:8000/docs.

Only the two `scripts/` steps need the `ml/` project. Once `data/` and `models/` are
populated, the service runs on its own. Re-run the export whenever the feature matrix
or source snapshot changes in `ml/`, then retrain.

Training fits on 2011-2023 and calibrates on pooled out-of-fold predictions from the
2019-2023 folds. **The locked test years 2024 and 2025 are never fitted or calibrated
on**, so the backtest figures the service reports stay honest.

### Version pins matter

`requirements.txt` pins scikit-learn 1.5.2 and lightgbm 4.5.0 exactly. The saved
bundle unpickles estimator objects from those libraries, so a version skew either
fails to load or, worse, loads and scores differently. The parity test below is what
proves the pins hold.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Model version, fitted years, years available |
| GET | `/api/models/{version}/card` | The model card, including limitations |
| GET | `/api/models/{version}/features` | Feature dictionary: 178 predictors by group |
| GET | `/api/runs/{year}/areas` | Ranked review list. Filters: `region`, `tla`, `history_sufficiency`, `min_prior_crashes`. Paging: `limit`, `offset` |
| GET | `/api/runs/{year}/areas/{cell_id}` | One cell's score, ranks and percentiles |
| GET | `/api/areas/{cell_id}/history` | Crash history for a cell across all years |
| POST | `/api/score` | Score many cells at once |

Years available are 2024 and 2025, the two locked backtest years. Both have known
outcomes, so `actual_outcome` lets a consumer check a prediction against what
happened.

### Example

```bash
# The spec's primary use case: Waikato, review capacity 50
curl "localhost:8000/api/runs/2025/areas?region=Waikato%20Region&limit=50"
```

## Two behaviours worth knowing

**Ineligible cells return 404, never a low probability.** A cell with no recorded
crash in the previous five years is outside the eligible population and cannot be
scored. The response says so explicitly:

```json
{"detail": {"cell_id": "NZTM1K-9999-9999", "status": "not scored",
            "reason": "... Treat it as not assessed, not as low risk."}}
```

This matters: about 15% of cells that go on to record a serious crash have no recent
history, so returning 0.02 for them would be actively misleading. Show them as "not
scored".

**Ranking uses the uncalibrated score; the reported probability is calibrated.**
Isotonic calibration is a step function that collapses ~21,000 cells onto ~100
distinct probabilities, so ranking on it would tie the top of the review list
together and make its order arbitrary. The underlying score preserves the fine
ordering (Spearman 0.998 against the calibrated value). Probabilities are exactly the
frozen backtest values; ranks are more finely ordered than the frozen files.

## Provenance

Every scored response carries `model_version`, `grid_version`,
`feature_schema_version` and `source_snapshot_id`, matching the frozen score schema,
so any number can be traced back to the model and data snapshot that produced it.

## Tests

```bash
.venv/bin/python -m pytest tests -q
```

The important one is `test_probability_matches_the_frozen_backtest`: it checks 50
sampled cells against `data/scores_2025_1km_lag0.parquet`. If model
persistence, calibration, or predictor-column ordering ever break, that test fails.
A silently reordered feature matrix, or a mismatched scikit-learn version, would
otherwise produce plausible but wrong probabilities with no error.

It is also the drift check on the vendored library: see `vendor/README.md`.

## Scope

This serves predictions only. It does **not** implement shortlists, exports, run
summaries or metrics endpoints from spec section 9, and it is **not** a production
deployment: no authentication, rate limiting, CORS policy, or container. Those are
separate work.

The model prioritises recurring crash areas within an eligible population. It is not
exposure-adjusted road risk: with no traffic volume or network geometry it cannot
separate a dangerous location from a merely busy one. It says where to look, not what
to build.
