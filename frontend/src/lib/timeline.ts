import type { YearHistory } from '../api/schemas'

/**
 * The history endpoint returns every year in the snapshot (2006-2026), and the
 * rows for the target year and later carry `actual_outcome` and
 * `scored_probability`. Verified against a live response: a 2024 request also
 * returns 2025 and a partial 2026.
 *
 * So the timeline is filtered before it is rendered:
 *   - before reveal, only years strictly earlier than the target year;
 *   - after reveal, up to and including the target year;
 *   - never any year beyond the target year, which is outside the run entirely.
 *
 * Only `crash_count` and `severe_count` are ever plotted. `scored_probability`
 * and `actual_outcome` are dropped here so they cannot reach the view.
 */
export interface TimelineYear {
  year: number
  crash_count: number
  severe_count: number
}

export function timelineYears(
  years: YearHistory[],
  targetYear: number,
  revealed: boolean,
): TimelineYear[] {
  const limit = revealed ? targetYear : targetYear - 1
  return years
    .filter((row) => row.year <= limit)
    .sort((a, b) => a.year - b.year)
    .map(({ year, crash_count, severe_count }) => ({ year, crash_count, severe_count }))
}

/** The lookback window that fed the model: the five years before the target. */
export function lookbackYears(years: YearHistory[], targetYear: number): TimelineYear[] {
  return timelineYears(years, targetYear, false).filter(
    (row) => row.year >= targetYear - 5,
  )
}

/** Most recent year before the target year that recorded any crash. */
export function mostRecentPriorCrashYear(
  years: YearHistory[],
  targetYear: number,
): number | null {
  const candidates = years
    .filter((row) => row.year < targetYear && row.crash_count > 0)
    .map((row) => row.year)
  return candidates.length > 0 ? Math.max(...candidates) : null
}

/** Text alternative to the timeline chart, for screen readers. */
export function timelineSummary(rows: TimelineYear[]): string {
  if (rows.length === 0) return 'No crash history available for this period.'
  const parts = rows.map(
    (row) =>
      `${row.year}: ${row.crash_count} crash${row.crash_count === 1 ? '' : 'es'}, ` +
      `${row.severe_count} serious or fatal`,
  )
  return `Reported crashes by year. ${parts.join('. ')}.`
}
