"""FastAPI service for the NZ Recurring Crash Area Prioritisation Assistant.

Serves a calibrated probability that a 1 km grid cell records a serious or fatal
crash in a target year, plus the capacity-limited ranked review list the product
is built around.

The central contract: a cell outside the eligible population returns 404 with an
explicit "not scored" reason, never a low probability. About 15% of cells that go
on to record a serious crash have no recent crash history and cannot be scored at
all, and presenting them as low risk would be actively misleading (spec 6).
"""

from __future__ import annotations

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import PlainTextResponse

from .dependencies import CARD_PATH, DICTIONARY_PATH, SERVED_YEARS, get_crash_history, get_state
from .schemas import (
    AreaHistory, AreaList, AreaListMeta, AreaScore, Health,
    NotScored, Provenance, ScoreRequest, ScoreResponse, YearHistory,
)

app = FastAPI(
    title="CAS Recurring Crash Area Prioritisation Assistant",
    description=(
        "Ranks 1 km grid cells by the probability of a serious or fatal crash in the "
        "next calendar year, among cells that recorded at least one crash in the "
        "previous five years.\n\n"
        "**This is not exposure-adjusted road risk.** It has no traffic volume and no "
        "network geometry, so it cannot separate a dangerous location from a merely "
        "busy one. It identifies where to look, not what to build. Cells outside the "
        "eligible population are returned as 'not scored', never as low risk."
    ),
    version="1.0.0",
)


def _area_score(row: pd.Series, provenance: Provenance, include_outcome: bool = True) -> AreaScore:
    return AreaScore(
        cell_id=row["cell_id"],
        target_year=int(row["target_year"]),
        probability=float(row["probability"]),
        national_rank=int(row["national_rank"]),
        national_percentile=float(row["national_percentile"]),
        regional_rank=int(row["regional_rank"]),
        regional_percentile=float(row["regional_percentile"]),
        region=row["region"],
        tla=row["tla"],
        history_sufficiency=row["history_sufficiency"],
        prior_crash_count=int(row["crash_count_5y"]),
        prior_severe_count=int(row["severe_count_5y"]),
        actual_outcome=int(row["target"]) if include_outcome else None,
        provenance=provenance,
    )


def _require_year(year: int) -> pd.DataFrame:
    frame = get_state().year_or_none(year)
    if frame is None:
        raise HTTPException(
            status_code=404,
            detail=f"No scored run for {year}. Available years: {list(SERVED_YEARS)}",
        )
    return frame


@app.get("/health", response_model=Health, tags=["service"])
def health() -> Health:
    state = get_state()
    return Health(
        model_version=state.bundle.model_version,
        trained_on_years=list(state.bundle.trained_on_years),
        calibrated_on_years=list(state.bundle.calibrated_on_years),
        years_available=sorted(state.scores),
        eligible_cells={year: len(frame) for year, frame in state.scores.items()},
    )


@app.get("/api/models/{model_version}/card", response_class=PlainTextResponse, tags=["models"])
def model_card(model_version: str) -> str:
    state = get_state()
    if model_version != state.bundle.model_version:
        raise HTTPException(404, f"Unknown model version {model_version}")
    if not CARD_PATH.exists():
        raise HTTPException(404, "Model card has not been generated")
    return CARD_PATH.read_text(encoding="utf-8")


@app.get("/api/models/{model_version}/features", tags=["models"])
def model_features(model_version: str) -> dict:
    state = get_state()
    if model_version != state.bundle.model_version:
        raise HTTPException(404, f"Unknown model version {model_version}")
    if not DICTIONARY_PATH.exists():
        raise HTTPException(404, "Feature dictionary has not been generated")
    dictionary = pd.read_csv(DICTIONARY_PATH)
    return {
        "model_version": model_version,
        "predictor_count": len(state.bundle.columns),
        "groups": dictionary.groupby("group").size().to_dict(),
        "features": dictionary.to_dict(orient="records"),
    }


@app.get("/api/runs/{target_year}/areas", response_model=AreaList, tags=["runs"])
def list_areas(
    target_year: int,
    region: str | None = Query(None, description="Exact region name, e.g. 'Waikato Region'"),
    tla: str | None = Query(None, description="Exact TLA name"),
    history_sufficiency: str | None = Query(None, pattern="^(low|sufficient)$"),
    min_prior_crashes: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> AreaList:
    """Ranked eligible cells, highest probability first.

    The default limit of 50 matches the review capacity in the spec's primary use
    case: an analyst inspects a shortlist, not the whole country.
    """
    frame = _require_year(target_year)
    state = get_state()

    filtered = frame
    if region:
        filtered = filtered[filtered["region"] == region]
    if tla:
        filtered = filtered[filtered["tla"] == tla]
    if history_sufficiency:
        filtered = filtered[filtered["history_sufficiency"] == history_sufficiency]
    if min_prior_crashes:
        filtered = filtered[filtered["crash_count_5y"] >= min_prior_crashes]

    provenance = Provenance(**state.bundle.provenance())
    page = filtered.iloc[offset: offset + limit]
    return AreaList(
        meta=AreaListMeta(
            target_year=target_year,
            total_matching=len(filtered),
            limit=limit,
            offset=offset,
            eligible_cells_in_year=len(frame),
            eligible_coverage=state.coverage.get(target_year, float("nan")),
        ),
        areas=[_area_score(row, provenance) for _, row in page.iterrows()],
    )


@app.get("/api/runs/{target_year}/areas/{cell_id}", response_model=AreaScore, tags=["runs"])
def area_detail(target_year: int, cell_id: str) -> AreaScore:
    _require_year(target_year)
    state = get_state()
    row = state.cell_row(target_year, cell_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=NotScored(
                cell_id=cell_id,
                target_year=target_year,
                reason=(
                    "This cell is not in the eligible population for the target year: "
                    "it recorded no crash in the previous five calendar years, so the "
                    "model has no history to score it from. Treat it as not assessed, "
                    "not as low risk."
                ),
            ).model_dump(),
        )
    return _area_score(row, Provenance(**state.bundle.provenance()))


@app.get("/api/areas/{cell_id}/history", response_model=AreaHistory, tags=["areas"])
def area_history(cell_id: str) -> AreaHistory:
    """Crash history for one cell across every year in the source snapshot."""
    counts = get_crash_history()
    cell = counts[counts["cell_id"] == cell_id]
    if cell.empty:
        raise HTTPException(404, f"No crash records for cell {cell_id}")

    state = get_state()
    region, tla = "Unknown", "Unknown"
    for year in sorted(state.scores, reverse=True):
        row = state.cell_row(year, cell_id)
        if row is not None:
            region, tla = row["region"], row["tla"]
            break

    years = []
    for _, record in cell.sort_values("crashYear").iterrows():
        year = int(record["crashYear"])
        scored = state.cell_row(year, cell_id)
        years.append(
            YearHistory(
                year=year,
                crash_count=int(record["crash_count"]),
                severe_count=int(record["severe_count"]),
                eligible=scored is not None,
                scored_probability=float(scored["probability"]) if scored is not None else None,
                actual_outcome=int(scored["target"]) if scored is not None else None,
            )
        )
    return AreaHistory(cell_id=cell_id, region=region, tla=tla, years=years)


@app.post("/api/score", response_model=ScoreResponse, tags=["scoring"])
def score(request: ScoreRequest) -> ScoreResponse:
    """Score many cells at once.

    Ineligible cells are reported in ``not_scored`` with a reason rather than
    being dropped silently or given a low probability.
    """
    frame = _require_year(request.target_year)
    state = get_state()
    provenance = Provenance(**state.bundle.provenance())

    requested = list(dict.fromkeys(request.cell_ids))  # de-duplicate, keep order
    matched = {row["cell_id"]: row for _, row in
               frame[frame["cell_id"].isin(requested)].iterrows()}

    scored, not_scored = [], []
    for cell_id in requested:
        if cell_id in matched:
            scored.append(_area_score(matched[cell_id], provenance))
        else:
            not_scored.append(
                {
                    "cell_id": cell_id,
                    "target_year": request.target_year,
                    "status": "not scored",
                    "reason": (
                        "Not in the eligible population: no crash recorded in the "
                        "previous five calendar years. Not assessed, not low risk."
                    ),
                }
            )
    return ScoreResponse(scored=scored, not_scored=not_scored)
