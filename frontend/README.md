# Arotahi — NZ Crash Area Prioritiser

Ranking recurring crash areas for analyst review.

React + TypeScript dashboard for the NZ Recurring Crash Area Prioritisation Assistant. It turns
the prediction service's ranked 1 km grid cells into a capacity-limited review queue, and keeps
the model's ranking visibly separate from the analyst's decision.

## About the name

*Arotahi* means "to focus", "look steadily", or "lens" ([Te Aka Māori
Dictionary](https://maoridictionary.co.nz/)) — fitting for an app whose job is to direct an
analyst's attention towards a manageable shortlist of areas.

## Running it

The front end talks to the FastAPI service in `../prediction-api`. Start that first:

```bash
cd ../prediction-api
.venv/bin/uvicorn app.main:app --reload      # http://127.0.0.1:8000, docs at /docs
```

Then:

```bash
npm install
npm run dev                                  # http://localhost:5173
```

Other scripts: `npm test` (Vitest), `npm run build` (typecheck + production build),
`npm run generate:regions` (see below).

### The dev proxy

The prediction service deliberately ships **no CORS middleware** (see its README, "Scope"), so
the browser cannot call it cross-origin. `vite.config.ts` proxies `/api` and `/health` to
`http://127.0.0.1:8000` instead. Point it elsewhere with `VITE_API_TARGET`.

Do not add CORS to the backend to work around this.

## Basemap

The map needs no configuration. It renders on a fresh clone, with no API key, no
signup and no billing.

Tiles come from [OpenFreeMap](https://openfreemap.org) (the `positron` style) and
are drawn by MapLibre GL JS. Attribution to OpenFreeMap, OpenMapTiles and
OpenStreetMap is required by the ODbL and is rendered by MapLibre's own
attribution control, bottom right; the map's context note is placed bottom left
so it never covers it.

Cell fills are inserted beneath the basemap's label layers, so road and place
names stay readable through them.

### How cells are drawn

The API serves no geometry, so each cell is derived from its identifier. `NZTM1K-{ix}-{iy}` encodes
`ix = floor(X/1000)`, `iy = floor(Y/1000)` in NZTM (EPSG:2193, origin 0,0); the cell is the 1 km
square from `(ix·1000, iy·1000)`. All four corners are reprojected to WGS84 with proj4 — EPSG:2193
is defined explicitly in `src/geo/nztm.ts` because proj4 does not ship it.

All cells are handed to MapLibre as a single GeoJSON source and rendered on the GPU, so the whole
national population (21,183 cells) is drawn at once with no viewport culling. Corner reprojection is
the real cost, so paths stay memoised (measured: ~2.0 s to build 21,183 paths cold, ~9 ms warm).

A handful of eligible cells sit east of the 180th meridian and reproject to negative longitudes, so
`cellBounds` shifts them past 180 before fitting the camera; a naive min/max would span the globe
the long way round.

## Generated and transcribed data

**`src/data/regions.json`** — the API has no endpoint listing regions or TLAs, and both filters
match exactly, so the lists are derived once by paging a full year and committed:

```bash
npm run generate:regions        # needs the API running; writes 17 regions, 98 TLAs
```

Regenerate when the source snapshot changes. Region names are displayed without the trailing
" Region" but always sent to the API in full. TLA names include macrons (`Ōtorohanga District`).

**`src/data/modelMetrics.json`** — transcribed from `ml/outputs/leaderboard.csv` (row
`gradient_boosted_calibrated`), `ml/outputs/model_card.md` and `ml/outputs/panel_coverage.csv`,
because the service exposes no metrics endpoint. Refresh it whenever the model is rebuilt. It is
labelled with its model version, and the app shows a banner if `/health` reports a different one.

### Offline figures vs live figures

These are deliberately kept apart, and the Model performance view says so:

- The **Prioritisation** view computes Recall@K, Precision@K and lift **live** from
  `actual_outcome` over the population in front of the analyst.
- The **Model performance** view shows the **offline** figures from the artefacts.

They differ slightly, and that is expected. The model card reports Waikato Recall@50 2024 as
0.1379; computing it from the served scores gives 0.1422. Isotonic calibration is monotonic but
collapses probabilities into few distinct values (42 Waikato cells share p = 0.2463), so the
capacity cut lands differently. Presenting either number as the other would be wrong.

## Product rules enforced in code

These are covered by tests (`npm test`) because they are the safety case, not styling:

1. **Outcomes stay hidden until revealed.** Before reveal there is no outcome column, no ▲ marker,
   and the two outcome tiles are replaced — not merely hidden with CSS. The history endpoint
   returns the target year, later years and a partial 2026 with outcomes attached, so
   `src/lib/timeline.ts` filters to `year < target_year` before reveal and `<= target_year` after,
   and drops `scored_probability` / `actual_outcome` entirely.
2. **A 404 with `status: "not scored"` renders as "Not assessed"**, showing the API's `reason`
   verbatim and no probability. Note the API's `detail` is an object only for this case; unknown
   year and unknown model return a plain string, so the error schema is a union.
3. **Eligibility is not a UI control.** "More filters" holds only TLA, history sufficiency and
   minimum prior crashes — nothing that changes the eligible population or the scores.
4. **Model ranking and analyst decision stay separate.** Shortlist entries store
   `score_at_selection` and `model_version_at_selection` and never update them.
5. **Wording** follows spec section 7. The persistent notice appears on every view.
6. **Provenance** (model, grid, feature schema, source snapshot, lookback years, lag-0) appears in
   the drawer and on every exported artefact.
7. **Only served years are selectable**, from `/health.years_available` (2024 and 2025). There is
   no 2023 and no Demonstration mode; the View select is disabled at Backtest with an explanation.

Ties are surfaced rather than hidden: when the capacity cut falls inside a run of equal
probabilities, the queue says the order within a tie is arbitrary.

## Deliberately deferred

Spec items the prediction service does not support, and what is done instead:

| Spec item | Why deferred | What the app does |
|---|---|---|
| Per-cell explanations / "factors contributing to this score" (§5.13, §6.4) | No endpoint; no SHAP or attribution is served | Shows a **Historical inputs** section from real prior counts, plus a note that per-cell explanations are not available. No factors are invented. |
| Server-side shortlists (§9) | None of the seven shortlist endpoints exist | `localStorage`, keyed by `target_year + model_version`. There is no authentication anywhere in the stack, so this is a single-analyst store on one machine. Note that single-tenancy is an assumption of this build, not a stated spec rule. |
| Metrics endpoint (Recall@K, Precision@K, Lift) | Not served | Computed client-side in `src/lib/backtestMetrics.ts` from `actual_outcome`. |
| "Newly active" positive cells (cells outside the eligible population) | Not derivable from the API | Shows `eligible_coverage` prominently with copy explaining the remainder cannot be listed. Roughly one in seven cells that recorded a serious or fatal crash was never eligible. |
| Cell geometry | Not served | Derived from `cell_id` (see above). |
| Region / TLA lists | Not served | Generated at build time into `regions.json`. |
| Refit schedule | Not stated in any artefact | Rendered as "Not specified in the published model artefacts" rather than invented. |
| Compare up to three cells (§6.3); `similar` areas; resolution sensitivity | Out of MVP scope / no endpoint | Not implemented. |

## Layout

```
src/
  api/       client.ts (fetch + typed errors), schemas.ts (zod), queries.ts (TanStack hooks)
  data/      regions.json (generated), modelMetrics.json (transcribed)
  geo/       nztm.ts (EPSG:2193), cellGeometry.ts (cell_id → polygon, bands)
  lib/       backtestMetrics.ts, timeline.ts, shortlistStore.ts, exportBrief.ts, copy.ts, markdown.ts
  views/     Prioritisation/, Shortlist/, ModelPerformance/
  components/ Topbar, Controls, MetricTiles, CellMap, QueueTable, AreaDrawer, DecisionStrip, Notices
  styles/    tokens.css (design :root), base.css
```

Every response is parsed with zod at the boundary, so a backend change fails visibly here rather
than silently producing a wrong number in a tile.

## Accessibility

WCAG 2.2 AA where practicable: labels on every control, the design's focus rings, the ranked table
as the keyboard-accessible alternative to the map, a text summary for the crash-history chart, and
no colour-only encoding — probability always carries its percentage, and the percentile band always
carries a text label. NZ English throughout.
