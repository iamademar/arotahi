"""NZTM grid assignment and cell-level region / TLA attribution (spec 4, 5.2).

The grid is fixed and versioned: origin (0, 0) in NZTM (EPSG:2193), square cells
by floor division. Cell identifiers are stable across runs so scores can be
joined over time.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

DEFAULT_CELL_SIZE_M = 1000
BLANK_LABELS = {"", "Null", "Unknown"}


def cell_indices(x: pd.Series, y: pd.Series, cell_size_m: int = DEFAULT_CELL_SIZE_M):
    """Floor-divide NZTM coordinates into integer grid indices."""
    ix = np.floor(pd.to_numeric(x, errors="coerce") / cell_size_m).astype("int64")
    iy = np.floor(pd.to_numeric(y, errors="coerce") / cell_size_m).astype("int64")
    return ix, iy


def cell_id_from_indices(ix, iy, cell_size_m: int = DEFAULT_CELL_SIZE_M) -> pd.Series:
    prefix = "NZTM1K" if cell_size_m == 1000 else f"NZTM{cell_size_m}M"
    return pd.Series(prefix + "-" + pd.Series(ix).astype(str) + "-" + pd.Series(iy).astype(str))


def assign_cells(
    frame: pd.DataFrame, cell_size_m: int = DEFAULT_CELL_SIZE_M, column: str = "cell_id"
) -> pd.DataFrame:
    """Attach a deterministic ``cell_id`` to every crash record.

    Every record with coordinates maps to exactly one cell, which the grid unit
    test in ``tests/`` asserts.
    """
    frame = frame.copy()
    ix, iy = cell_indices(frame["X"], frame["Y"], cell_size_m)
    frame["cell_ix"] = ix.to_numpy()
    frame["cell_iy"] = iy.to_numpy()
    frame[column] = cell_id_from_indices(ix.to_numpy(), iy.to_numpy(), cell_size_m).to_numpy()
    return frame


def occupied_cell_count(frame: pd.DataFrame, cell_size_m: int = DEFAULT_CELL_SIZE_M) -> int:
    """Distinct occupied cells across all years, for reconciliation with spec 2."""
    ix, iy = cell_indices(frame["X"], frame["Y"], cell_size_m)
    return int(pd.MultiIndex.from_arrays([ix, iy]).nunique())


def cell_centroids(frame: pd.DataFrame, cell_size_m: int = DEFAULT_CELL_SIZE_M) -> pd.DataFrame:
    """Cell centroid coordinates, for mapping only, never as predictors."""
    cells = frame[["cell_id", "cell_ix", "cell_iy"]].drop_duplicates("cell_id")
    half = cell_size_m / 2
    return cells.assign(
        centroid_x=cells["cell_ix"] * cell_size_m + half,
        centroid_y=cells["cell_iy"] * cell_size_m + half,
    )


def modal_label(frame: pd.DataFrame, label_column: str) -> pd.DataFrame:
    """Modal label per cell across all crash records and all years (spec 5.2).

    Deterministic tie-breaking (spec 5.8 rule 7): highest count wins; ties go to
    the label seen in the most recent crash year; remaining ties resolve
    alphabetically. Cells with no usable label become ``Unknown``.
    """
    usable = frame[~frame[label_column].fillna("").isin(BLANK_LABELS)]

    counts = (
        usable.groupby(["cell_id", label_column], observed=True)
        .agg(n=(label_column, "size"), last_year=("crashYear", "max"))
        .reset_index()
    )
    # Sort so the winning row per cell is first: count desc, recency desc, name asc.
    counts = counts.sort_values(
        ["cell_id", "n", "last_year", label_column],
        ascending=[True, False, False, True],
        kind="mergesort",
    )
    winners = counts.drop_duplicates("cell_id", keep="first")

    all_cells = pd.DataFrame({"cell_id": frame["cell_id"].unique()})
    out = all_cells.merge(
        winners[["cell_id", label_column]].rename(columns={label_column: f"cell_{label_column}"}),
        on="cell_id",
        how="left",
    )
    out[f"cell_{label_column}"] = out[f"cell_{label_column}"].fillna("Unknown")
    return out


def cell_attributes(frame: pd.DataFrame) -> pd.DataFrame:
    """Cell-level region and TLA under the modal rule, plus multi-region diagnostics."""
    region = modal_label(frame, "region")
    tla = modal_label(frame, "tlaName")

    usable = frame[~frame["region"].fillna("").isin(BLANK_LABELS)]
    spread = (
        usable.groupby("cell_id")["region"].nunique().rename("distinct_regions").reset_index()
    )

    out = region.merge(tla, on="cell_id", how="outer").merge(spread, on="cell_id", how="left")
    out["distinct_regions"] = out["distinct_regions"].fillna(0).astype(int)
    return out.rename(columns={"cell_region": "region", "cell_tlaName": "tla"})


def modal_tie_count(frame: pd.DataFrame, label_column: str = "region") -> int:
    """Cells where the top label was decided by tie-break rather than a clear mode."""
    usable = frame[~frame[label_column].fillna("").isin(BLANK_LABELS)]
    counts = usable.groupby(["cell_id", label_column], observed=True).size().rename("n").reset_index()
    top = counts.groupby("cell_id")["n"].transform("max")
    tied = counts[counts["n"] == top].groupby("cell_id").size()
    return int((tied > 1).sum())
