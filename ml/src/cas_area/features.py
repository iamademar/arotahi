"""Lookback feature builder (spec 5.5, 5.6).

Every feature for target year t is computed strictly from crash records in
years t-5 to t-1. No target-year record, and no record from a later year, may
influence any feature. ``tests/test_leakage.py`` enforces this.

Never used as predictors (spec 5.7): OBJECTID, raw X/Y, cell_id, crashYear,
crashFinancialYear, and any target-year field.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .grid import BLANK_LABELS
from .io import valid_lane_count, valid_speed_limit

WINDOWS = {"1y": 1, "3y": 3, "5y": 5}

MODAL_CONTEXT_COLUMNS = [
    "urban", "roadCharacter", "roadLane", "roadSurface", "trafficControl", "streetLight",
]
ROAD_USER_COLUMNS = ["pedestrian", "bicycle", "motorcycle", "truck", "bus", "schoolBus"]

DARK_LIGHT_LABELS = {"Dark", "Twilight"}
WET_WEATHER_LABELS = {"Light rain", "Heavy rain", "Mist or Fog", "Snow", "Hail or Sleet"}
WET_SURFACE_LABELS = {"Wet", "Ice or snow"}
UNSEALED_SURFACE_LABELS = {"Unsealed"}


def _safe_share(numerator, denominator):
    """Share with a safe zero denominator (spec 5.8 rule 8)."""
    denominator = np.asarray(denominator, dtype=float)
    numerator = np.asarray(numerator, dtype=float)
    return np.divide(
        numerator, denominator, out=np.zeros_like(numerator, dtype=float), where=denominator > 0
    )


def prepare_records(frame: pd.DataFrame) -> pd.DataFrame:
    """Derive the per-crash indicator columns the aggregates are built from."""
    out = frame.copy()

    out["is_fatal"] = (out["crashSeverity"] == "Fatal Crash").astype("int8")
    out["is_serious"] = (out["crashSeverity"] == "Serious Crash").astype("int8")
    out["is_minor"] = (out["crashSeverity"] == "Minor Crash").astype("int8")
    out["is_noninjury"] = (out["crashSeverity"] == "Non-Injury Crash").astype("int8")

    out["is_dark"] = out["light"].isin(DARK_LIGHT_LABELS).astype("int8")
    out["is_wet_weather"] = (
        out["weatherA"].isin(WET_WEATHER_LABELS) | out["weatherB"].isin(WET_WEATHER_LABELS)
    ).astype("int8")
    out["is_wet_surface"] = out["roadSurface"].isin(WET_SURFACE_LABELS).astype("int8")
    out["is_unsealed"] = out["roadSurface"].isin(UNSEALED_SURFACE_LABELS).astype("int8")
    out["is_holiday"] = (~out["holiday"].fillna("").isin(BLANK_LABELS)).astype("int8")
    out["is_state_highway"] = (out["crashSHDescription"] == "Yes").astype("int8")

    for column in ("roadworks", "slipOrFlood"):
        out[f"is_{column.lower()}"] = (
            pd.to_numeric(out[column], errors="coerce").fillna(0) > 0
        ).astype("int8")

    for column in ROAD_USER_COLUMNS:
        out[f"has_{column}"] = (
            pd.to_numeric(out[column], errors="coerce").fillna(0) > 0
        ).astype("int8")

    out["speed_valid"] = valid_speed_limit(out["speedLimit"])
    out["speed_clean"] = pd.to_numeric(out["speedLimit"], errors="coerce").where(out["speed_valid"])
    out["speed_invalid"] = (~out["speed_valid"]).astype("int8")

    out["lanes_valid"] = valid_lane_count(out["NumberOfLanes"])
    out["lanes_clean"] = pd.to_numeric(out["NumberOfLanes"], errors="coerce").where(out["lanes_valid"])
    out["lanes_invalid"] = (~out["lanes_valid"]).astype("int8")

    out["region_missing"] = out["region"].fillna("").isin(BLANK_LABELS).astype("int8")
    out["tla_missing"] = out["tlaName"].fillna("").isin(BLANK_LABELS).astype("int8")

    unknown_fields = ["weatherA", "weatherB", "light", "roadSurface", "trafficControl", "streetLight"]
    out["unknown_field_count"] = sum(
        out[c].fillna("").isin(BLANK_LABELS).astype("int8") for c in unknown_fields
    )
    out["unknown_field_total"] = len(unknown_fields)
    out["coord_key"] = out["X"].round(0).astype("int64") * 10_000_000 + out["Y"].round(0).astype("int64")
    return out


def _modal_within(slice_: pd.DataFrame, column: str, name: str) -> pd.DataFrame:
    """Modal value of a categorical within the lookback window, deterministic ties."""
    usable = slice_[~slice_[column].fillna("").isin(BLANK_LABELS)]
    if usable.empty:
        return pd.DataFrame({"cell_id": [], name: [], f"{name}_share": []})

    counts = (
        usable.groupby(["cell_id", column], observed=True)
        .agg(n=(column, "size"), last_year=("crashYear", "max"))
        .reset_index()
        .sort_values(
            ["cell_id", "n", "last_year", column],
            ascending=[True, False, False, True],
            kind="mergesort",
        )
    )
    totals = counts.groupby("cell_id")["n"].sum().rename("total")
    winners = counts.drop_duplicates("cell_id", keep="first").merge(totals, on="cell_id")
    winners[f"{name}_share"] = _safe_share(winners["n"], winners["total"])
    return winners[["cell_id", column, f"{name}_share"]].rename(columns={column: name})


def _window_features(records: pd.DataFrame, start: int, end: int, suffix: str) -> pd.DataFrame:
    """Aggregate one lookback window into per-cell features."""
    slice_ = records[(records["crashYear"] >= start) & (records["crashYear"] <= end)]
    if slice_.empty:
        return pd.DataFrame({"cell_id": []})

    grouped = slice_.groupby("cell_id", observed=True)
    out = grouped.agg(
        **{
            f"crash_count_{suffix}": ("is_severe", "size"),
            f"severe_count_{suffix}": ("is_severe", "sum"),
            f"fatal_count_{suffix}": ("is_fatal", "sum"),
            f"serious_count_{suffix}": ("is_serious", "sum"),
            f"minor_count_{suffix}": ("is_minor", "sum"),
            f"noninjury_count_{suffix}": ("is_noninjury", "sum"),
            f"years_with_crash_{suffix}": ("crashYear", "nunique"),
            f"last_crash_year_{suffix}": ("crashYear", "max"),
            f"dark_count_{suffix}": ("is_dark", "sum"),
            f"wet_weather_count_{suffix}": ("is_wet_weather", "sum"),
            f"wet_surface_count_{suffix}": ("is_wet_surface", "sum"),
            f"unsealed_count_{suffix}": ("is_unsealed", "sum"),
            f"holiday_count_{suffix}": ("is_holiday", "sum"),
            f"roadworks_count_{suffix}": ("is_roadworks", "sum"),
            f"slipflood_count_{suffix}": ("is_sliporflood", "sum"),
            f"sh_count_{suffix}": ("is_state_highway", "sum"),
            f"speed_invalid_count_{suffix}": ("speed_invalid", "sum"),
            f"lanes_invalid_count_{suffix}": ("lanes_invalid", "sum"),
            f"region_missing_count_{suffix}": ("region_missing", "sum"),
            f"tla_missing_count_{suffix}": ("tla_missing", "sum"),
            f"unknown_field_count_{suffix}": ("unknown_field_count", "sum"),
            f"distinct_coords_{suffix}": ("coord_key", "nunique"),
            f"speed_median_{suffix}": ("speed_clean", "median"),
            f"lanes_modal_{suffix}": ("lanes_clean", lambda s: s.mode().iat[0] if not s.mode().empty else np.nan),
        }
    ).reset_index()

    for column in ROAD_USER_COLUMNS:
        out[f"{column}_count_{suffix}"] = (
            grouped[f"has_{column}"].sum().reset_index(drop=True).to_numpy()
        )

    total = out[f"crash_count_{suffix}"]
    share_sources = [
        "severe", "dark", "wet_weather", "wet_surface", "unsealed", "holiday",
        "roadworks", "slipflood", "sh", "speed_invalid", "lanes_invalid",
        "region_missing", "tla_missing",
    ] + ROAD_USER_COLUMNS
    for source in share_sources:
        out[f"{source}_share_{suffix}"] = _safe_share(out[f"{source}_count_{suffix}"], total)

    out[f"unknown_field_share_{suffix}"] = _safe_share(
        out[f"unknown_field_count_{suffix}"], total * int(records["unknown_field_total"].iloc[0])
    )
    return out


NEIGHBOUR_OFFSETS = [
    (dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx, dy) != (0, 0)
]


def neighbour_features(window: pd.DataFrame, cells: pd.DataFrame) -> pd.DataFrame:
    """Crash history in the 8 adjacent 1 km cells.

    Risk does not stop at a cell boundary, but each cell is otherwise scored in
    isolation: a quiet cell beside a dangerous corridor looks identical to a quiet
    cell in empty country. This also addresses grid-edge instability, since a
    crash just over a boundary now informs both cells.

    ``window`` must already be restricted to the lookback years, so these features
    inherit the same temporal cut as everything else.
    """
    own = (
        window.groupby(["cell_ix", "cell_iy"], observed=True)
        .agg(n_crashes=("is_severe", "size"), n_severe=("is_severe", "sum"))
        .reset_index()
    )

    totals = None
    for dx, dy in NEIGHBOUR_OFFSETS:
        shifted = own.assign(cell_ix=own["cell_ix"] + dx, cell_iy=own["cell_iy"] + dy)
        totals = shifted if totals is None else pd.concat([totals, shifted], ignore_index=True)

    neighbour = (
        totals.groupby(["cell_ix", "cell_iy"], observed=True)
        .agg(neighbour_crash_count=("n_crashes", "sum"),
             neighbour_severe_count=("n_severe", "sum"),
             neighbour_cells_active=("n_crashes", "size"))
        .reset_index()
    )

    out = cells.merge(neighbour, on=["cell_ix", "cell_iy"], how="left")
    for column in ("neighbour_crash_count", "neighbour_severe_count", "neighbour_cells_active"):
        out[column] = out[column].fillna(0)
    out["neighbour_severe_share"] = _safe_share(
        out["neighbour_severe_count"], out["neighbour_crash_count"])
    out["neighbour_mean_crashes"] = _safe_share(
        out["neighbour_crash_count"], out["neighbour_cells_active"])
    return out.drop(columns=["cell_ix", "cell_iy"])


def empirical_bayes_rates(
    features_frame: pd.DataFrame, prior_strength: float = 20.0
) -> pd.DataFrame:
    """Shrink each cell's severe rate toward its TLA, then region, base rate.

    Cells with one or two prior crashes have history features that are mostly
    noise, and they dominate the sparse regions where the model sits furthest
    from its ranking ceiling. Shrinking toward a stable group mean should help
    exactly there.

    All group means are computed within the supplied frame, which the caller must
    restrict to training rows, so no target-year information leaks in.
    """
    out = features_frame
    severe = out["severe_count_5y"].to_numpy(dtype=float)
    total = out["crash_count_5y"].to_numpy(dtype=float)

    national = severe.sum() / total.sum() if total.sum() > 0 else 0.0

    def group_rate(key: str) -> np.ndarray:
        grouped = out.groupby(key, observed=True).agg(
            g_severe=("severe_count_5y", "sum"), g_total=("crash_count_5y", "sum"))
        rate = _safe_share(grouped["g_severe"], grouped["g_total"])
        rate = pd.Series(np.where(grouped["g_total"] > 0, rate, national), index=grouped.index)
        return out[key].map(rate).fillna(national).to_numpy(dtype=float)

    tla_rate = group_rate("tla")
    region_rate = group_rate("region")

    # Two-level shrinkage: cell toward TLA, TLA toward region.
    shrunk_tla = (tla_rate * total + region_rate * prior_strength) / (total + prior_strength)
    cell_rate = (severe + shrunk_tla * prior_strength) / (total + prior_strength)

    return pd.DataFrame(
        {
            "eb_severe_rate": cell_rate,
            "eb_tla_rate": tla_rate,
            "eb_region_rate": region_rate,
            "eb_rate_lift": cell_rate / np.where(region_rate > 0, region_rate, national or 1.0),
        },
        index=out.index,
    )


def add_empirical_bayes(
    features_frame: pd.DataFrame, fit_on: pd.DataFrame | None = None,
    prior_strength: float = 20.0,
) -> pd.DataFrame:
    """Attach empirical-Bayes rate features, fitting group means on training rows."""
    source = features_frame if fit_on is None else fit_on
    national = (source["severe_count_5y"].sum() / source["crash_count_5y"].sum()
                if source["crash_count_5y"].sum() > 0 else 0.0)

    rates = {}
    for key in ("tla", "region"):
        grouped = source.groupby(key, observed=True).agg(
            g_severe=("severe_count_5y", "sum"), g_total=("crash_count_5y", "sum"))
        rate = _safe_share(grouped["g_severe"], grouped["g_total"])
        rates[key] = pd.Series(
            np.where(grouped["g_total"] > 0, rate, national), index=grouped.index)

    out = features_frame.copy()
    severe = out["severe_count_5y"].to_numpy(dtype=float)
    total = out["crash_count_5y"].to_numpy(dtype=float)
    tla_rate = out["tla"].map(rates["tla"]).fillna(national).to_numpy(dtype=float)
    region_rate = out["region"].map(rates["region"]).fillna(national).to_numpy(dtype=float)

    shrunk_tla = (tla_rate * total + region_rate * prior_strength) / (total + prior_strength)
    out["eb_severe_rate"] = (severe + shrunk_tla * prior_strength) / (total + prior_strength)
    out["eb_tla_rate"] = tla_rate
    out["eb_region_rate"] = region_rate
    denom = np.where(region_rate > 0, region_rate, national if national > 0 else 1.0)
    out["eb_rate_lift"] = out["eb_severe_rate"] / denom
    return out


def build_features(
    records: pd.DataFrame,
    panel: pd.DataFrame,
    lookback: int = 5,
    include_neighbours: bool = False,
) -> pd.DataFrame:
    """Feature matrix for every eligible cell-year in ``panel``.

    ``records`` must carry cell_id and the indicators from ``prepare_records``.
    """
    per_year_national = records.groupby("crashYear", observed=True).size().rename("national_total")
    per_year_region = (
        records.groupby(["crashYear", "region"], observed=True).size().rename("region_total")
    )

    frames = []
    for target_year, panel_year in panel.groupby("target_year"):
        start, end = target_year - lookback, target_year - 1
        # Hard temporal cut: nothing at or after the target year is visible.
        window = records[(records["crashYear"] >= start) & (records["crashYear"] <= end)]

        carried = ["cell_id", "target_year", "target", "history_sufficiency"]
        if "target_severe_count" in panel_year.columns:
            carried.append("target_severe_count")
        features = panel_year[carried].copy()

        for suffix, span in WINDOWS.items():
            part = _window_features(window, target_year - span, end, suffix)
            features = features.merge(part, on="cell_id", how="left")

        if include_neighbours:
            cells = (
                window[["cell_id", "cell_ix", "cell_iy"]]
                .drop_duplicates("cell_id")
                .merge(features[["cell_id"]], on="cell_id", how="right")
            )
            missing = cells["cell_ix"].isna()
            if missing.any():
                lookup = records[["cell_id", "cell_ix", "cell_iy"]].drop_duplicates("cell_id")
                cells = cells.drop(columns=["cell_ix", "cell_iy"]).merge(
                    lookup, on="cell_id", how="left")
            cells["cell_ix"] = cells["cell_ix"].astype("int64")
            cells["cell_iy"] = cells["cell_iy"].astype("int64")
            features = features.merge(neighbour_features(window, cells), on="cell_id", how="left")

        for column in MODAL_CONTEXT_COLUMNS:
            modal = _modal_within(window, column, f"modal_{column}")
            features = features.merge(modal, on="cell_id", how="left")

        speed_modal = _modal_within(
            window.assign(speed_band=window["speed_clean"].astype("Int64").astype(str)),
            "speed_band", "modal_speed",
        )
        features = features.merge(speed_modal, on="cell_id", how="left")

        for column, name in (("region", "region"), ("tlaName", "tla")):
            modal = _modal_within(window, column, name)
            features = features.merge(modal.drop(columns=[f"{name}_share"]), on="cell_id", how="left")

        # Trend and recency, derived from the windows above.
        features["yoy_trend"] = features["crash_count_1y"].fillna(0) - (
            features["crash_count_3y"].fillna(0) - features["crash_count_1y"].fillna(0)
        ) / 2
        features["years_since_last_crash"] = target_year - features["last_crash_year_5y"]
        features["share_years_with_crash_5y"] = features["years_with_crash_5y"].fillna(0) / lookback
        features["ever_severe_5y"] = (features["severe_count_5y"].fillna(0) > 0).astype("int8")

        severe_years = (
            window[window["is_severe"] == 1].groupby("cell_id", observed=True)["crashYear"].max()
        )
        features = features.merge(
            severe_years.rename("last_severe_year").reset_index(), on="cell_id", how="left"
        )
        features["years_since_last_severe"] = (
            target_year - features["last_severe_year"]
        ).fillna(99)

        # Relative volume: the national and regional share of the cell's activity.
        national = float(per_year_national.reindex(range(start, end + 1)).sum())
        features["national_volume_share_5y"] = _safe_share(
            features["crash_count_5y"].fillna(0), national
        )
        region_totals = (
            per_year_region.reset_index()
            .query("@start <= crashYear <= @end")
            .groupby("region")["region_total"].sum()
        )
        features["region_volume_share_5y"] = _safe_share(
            features["crash_count_5y"].fillna(0),
            features["region"].map(region_totals).fillna(0).to_numpy(),
        )

        features["records_used"] = features["crash_count_5y"].fillna(0)
        frames.append(features)

    out = pd.concat(frames, ignore_index=True)
    return _apply_missing_rules(out)


# Medians and modal numerics are genuinely absent when no valid record exists in
# the window; zero would be a false reading (a 0 km/h speed limit), so they get a
# sentinel plus an explicit indicator instead.
SENTINEL_NUMERIC = -1.0
SENTINEL_COLUMN_PREFIXES = ("speed_median_", "lanes_modal_", "years_since_last_crash")


def _apply_missing_rules(out: pd.DataFrame) -> pd.DataFrame:
    """Explicit, documented missing handling (spec 5.8 rule 8).

    Counts and shares are zero when the window holds no crashes. Medians and
    modal numerics take a sentinel and a paired ``*_missing`` indicator so the
    model can distinguish "no data" from a real low value.
    """
    out["region"] = out["region"].fillna("Unknown")
    out["tla"] = out["tla"].fillna("Unknown")

    indicators = {}
    for column in out.columns:
        if column in NON_PREDICTORS or out[column].dtype.kind not in "if":
            continue
        if column.startswith(SENTINEL_COLUMN_PREFIXES):
            indicators[f"{column}_missing"] = out[column].isna().astype("int8")
            out[column] = out[column].fillna(SENTINEL_NUMERIC)
        else:
            # Absence of crashes in the window means a genuine zero.
            out[column] = out[column].fillna(0)
    if indicators:
        # Build the indicators in one concat to avoid fragmenting the frame.
        out = pd.concat([out, pd.DataFrame(indicators, index=out.index)], axis=1)

    for column in out.columns:
        if out[column].dtype == object and column not in NON_PREDICTORS:
            out[column] = out[column].fillna("Unknown")
    return out


# Identifier and bookkeeping columns that must never enter the model matrix.
NON_PREDICTORS = [
    # target_severe_count is the target-year outcome, carried only as an
    # alternative training signal. It must never reach the model matrix.
    "cell_id", "target_year", "target", "target_severe_count", "history_sufficiency",
    "last_crash_year_1y", "last_crash_year_3y", "last_crash_year_5y", "last_severe_year",
]


def predictor_columns(features: pd.DataFrame, include_geography: bool = True) -> list[str]:
    """Model input columns, optionally dropping region and TLA (spec 5.7 check)."""
    columns = [c for c in features.columns if c not in NON_PREDICTORS]
    if not include_geography:
        columns = [c for c in columns if c not in ("region", "tla")]
    return columns


def feature_dictionary(features: pd.DataFrame) -> pd.DataFrame:
    """Documentation of every feature: group, window, type and missing rule."""
    def group_of(name: str) -> str:
        if name in ("region", "tla") or name.startswith("modal_") or name.startswith("region_volume"):
            return "road context / geography"
        if any(name.startswith(p) for p in ("fatal", "serious", "minor", "noninjury", "severe", "ever_severe", "years_since_last_severe")):
            return "severity history"
        if any(name.startswith(p) for p in ("crash_count", "years_with_crash", "yoy", "years_since_last_crash", "share_years", "national_volume", "records_used")):
            return "crash-frequency history"
        if any(name.startswith(p) for p in ("dark", "wet", "unsealed", "holiday", "roadworks", "slipflood", "sh_")):
            return "crash conditions"
        if any(name.startswith(p) for p in ROAD_USER_COLUMNS):
            return "road users"
        if any(k in name for k in ("invalid", "missing", "unknown", "distinct_coords")):
            return "data quality"
        return "other"

    def window_of(name: str) -> str:
        for suffix in ("_1y", "_3y", "_5y"):
            if name.endswith(suffix):
                return f"t-{suffix[1]} to t-1" if suffix != "_1y" else "t-1"
        return "t-5 to t-1"

    rows = []
    for name in predictor_columns(features):
        rows.append(
            {
                "name": name,
                "group": group_of(name),
                "lookback_window": window_of(name),
                "dtype": str(features[name].dtype),
                "missing_rule": "zero-filled" if features[name].dtype.kind in "if" else "Unknown category",
            }
        )
    return pd.DataFrame(rows).sort_values(["group", "name"]).reset_index(drop=True)
