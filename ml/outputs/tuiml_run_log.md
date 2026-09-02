# TuiML usage log

Recorded so every TuiML call in the notebooks is reproducible, per the build
instruction to name the tool and parameters used and to report errors rather
than silently falling back to local training.

## Tools inspected

| Tool | Purpose | Outcome |
|---|---|---|
| `tuiml_list(category='algorithm', type='classifier')` | Find candidate models | 89 classifiers available, including `LogisticRegression`, `RandomForestClassifier`, `LightGBMClassifier`, `XGBoostClassifier`, `CatBoostClassifier` |
| `tuiml_list(category='splitting')` | Find a year-aware splitter | 14 splitters, none year-aware. `TimeSeriesSplit` splits on row order, not on a year column |
| `tuiml_describe('LightGBMClassifier')` | Check the parameter schema | No `class_weight` / `scale_pos_weight` parameter exposed |
| `tuiml_upload_data(file_path=..., name='cas_area_train_2011_2022')` | Register the training panel | Success: 244,915 rows, 169 numeric features |
| `tuiml_train(...)` | Fit the gradient-boosted candidate | Ran successfully; see the finding below |
| `tuiml_predict(model_id=..., return_proba=true)` | Score locked test 2024 | Returned hard 0/1 labels, not probabilities |

## Runs

**Run 1** — `tuiml_train`, model_id `77418775a331`
```
algorithm: LightGBMClassifier
data: cas_area_train_2011_2022
target: target
algorithm_params: {n_estimators: 400, learning_rate: 0.05, num_leaves: 31,
                   min_child_samples: 30, subsample: 0.9, colsample_bytree: 0.8,
                   random_state: 20250831}
test_size: 0.2, random_seed: 20250831
-> roc_auc_score 0.5840, f1_score 0.2767
```

**Run 2** — same without `subsample`/`colsample_bytree`, model_id `a10ef0fe90cf` -> roc_auc_score 0.5828

**Run 3** — `LogisticRegression` with `StandardScaler`, model_id `91650260b580` -> roc_auc_score 0.5745

## Finding: TuiML cannot produce the ranking scores this product requires

The reported TuiML scores (ROC-AUC around 0.57 to 0.58) are far below the same
algorithms fitted locally on the identical feature matrix (ROC-AUC around 0.79
to 0.81). The cause was isolated rather than assumed:

1. It is not the temporal split. Reproducing TuiML's own random 80/20 holdout
   locally still gives ROC-AUC 0.8079.
2. It is not the missing `class_weight`. Locally, `class_weight='balanced'`
   gives 0.8079 and `class_weight=None` gives 0.8097 - the parameter barely
   moves ROC-AUC.
3. It is not specific to LightGBM. TuiML's `LogisticRegression` shows the same
   depressed figure (0.5745).
4. **It is the prediction interface.** `tuiml_predict` with `return_proba: true`
   returns hard 0/1 class labels (only values 0.0 and 1.0, 354 positives
   predicted out of 21,396). Computing ROC-AUC on binarised labels caps the
   achievable value; scoring those same outputs against the truth reproduces
   0.5700, matching the reported figure.

A capacity-limited review list must rank every eligible cell by probability, so
binary labels cannot drive the product: there is no way to take a top 50.
TuiML's saved artefact also cannot be loaded outside the TuiML environment
(`ModuleNotFoundError: No module named 'tuiml'`), so its estimator cannot be
re-scored locally to recover probabilities.

## Decision

TuiML was used to fit and cross-check the gradient-boosted and logistic
candidates, and those runs are recorded above. Final models are fitted locally
with scikit-learn and LightGBM, because the pipeline needs:

- explicit target-year train/predict splits (no TuiML splitter supports this);
- continuous probabilities for ranking and for Recall/Precision/Lift@K;
- out-of-fold probabilities for calibration (spec 5.13);
- the primary metric, mean within-region Recall@5%, which TuiML does not compute.

This is a reported limitation, not a silent fallback.
