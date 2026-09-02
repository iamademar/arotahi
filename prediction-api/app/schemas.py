"""Response models for the prediction API.

Every scored response carries provenance. A probability with no record of which
model, grid and source snapshot produced it cannot be traced or reproduced.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class Provenance(BaseModel):
    model_version: str
    grid_version: str
    feature_schema_version: str
    source_snapshot_id: str


class Health(BaseModel):
    status: str = "ok"
    model_version: str
    trained_on_years: list[int]
    calibrated_on_years: list[int]
    years_available: list[int]
    eligible_cells: dict[int, int]


class AreaScore(BaseModel):
    """One scored cell."""

    cell_id: str
    target_year: int
    probability: float = Field(..., description="Calibrated probability of a serious or fatal crash")
    national_rank: int
    national_percentile: float
    regional_rank: int
    regional_percentile: float
    region: str
    tla: str
    history_sufficiency: str = Field(
        ..., description="'low' when the cell had fewer than 3 crashes in the lookback window")
    prior_crash_count: int
    prior_severe_count: int
    actual_outcome: int | None = Field(
        None, description="Known outcome for a backtest year; null for a forecast")
    provenance: Provenance


class AreaListMeta(BaseModel):
    target_year: int
    total_matching: int
    limit: int
    offset: int
    eligible_cells_in_year: int
    eligible_coverage: float = Field(
        ...,
        description=(
            "Share of the year's serious/fatal cells that were in the eligible "
            "population. The remainder are cells with no recent crash history and "
            "cannot be scored at all."
        ),
    )


class AreaList(BaseModel):
    meta: AreaListMeta
    areas: list[AreaScore]


class YearHistory(BaseModel):
    year: int
    crash_count: int
    severe_count: int
    eligible: bool
    scored_probability: float | None = None
    actual_outcome: int | None = None


class AreaHistory(BaseModel):
    cell_id: str
    region: str
    tla: str
    years: list[YearHistory]


class ScoreRequest(BaseModel):
    target_year: int = Field(..., description="Year to score; must be an available panel year")
    cell_ids: list[str] = Field(..., min_length=1, max_length=5000)


class ScoreResponse(BaseModel):
    scored: list[AreaScore]
    not_scored: list[dict] = Field(
        default_factory=list,
        description="Cells that are not in the eligible population, with the reason",
    )


class NotScored(BaseModel):
    """Returned as a 404 body. Never a low probability."""

    cell_id: str
    target_year: int
    status: str = "not scored"
    reason: str
