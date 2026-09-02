# Vendored `cas_area`

A copy of `cas_area` from the ml modelling project, taken on 2026-08-31 from
`ml/src/cas_area/`. The service imports it from here so it can run with the
modelling project absent.

**This is a copy and it will drift.** A change made in `ml/src/cas_area/` does not
reach the service until someone re-copies it, and nothing enforces that:

```bash
rm -rf vendor/cas_area && cp -R ../ml/src/cas_area vendor/cas_area
# then re-apply the local change below, and rerun the tests
```

## The one intentional difference

`registry.default_model_path` takes a models **directory** here, where the ml copy
takes a project root and appends `prediction-api/models`. That assumption stopped
holding when the service moved out of the ml project.

## What is actually used

Serving needs only `__init__` (version constants), `registry`, and
`modelling.apply_calibrator`. `features`, `evaluation` and `metrics` are used by
`scripts/train_and_save.py`. `io`, `grid` and `panel` are not used by the service at
all - they are kept so the package stays a faithful copy rather than a pruned fork.

## Drift protection

`tests/test_api.py::test_probability_matches_the_frozen_backtest` compares served
probabilities against the frozen backtest scores. If the vendored copy drifts far
enough to change a prediction, that test fails. It does not catch drift that changes
nothing observable.
