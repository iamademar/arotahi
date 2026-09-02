import { describe, expect, it } from 'vitest'
import { lookbackYears, mostRecentPriorCrashYear, timelineSummary, timelineYears } from './timeline'
import type { YearHistory } from '../api/schemas'

/**
 * Mirrors a real /api/areas/{id}/history response: every year from 2006 to 2026,
 * with scored probabilities and outcomes attached to the served years and a
 * partial 2026. The rows past the target year are exactly what must not leak.
 */
function history(): YearHistory[] {
  const years: YearHistory[] = []
  for (let year = 2006; year <= 2026; year += 1) {
    const served = year === 2024 || year === 2025
    years.push({
      year,
      crash_count: 10 + (year % 5),
      severe_count: year % 3,
      eligible: served,
      scored_probability: served ? 0.93 : null,
      actual_outcome: served ? 1 : null,
    })
  }
  return years
}

describe('timelineYears', () => {
  it('shows no year at or beyond the target year before outcomes are revealed', () => {
    const rows = timelineYears(history(), 2024, false)
    expect(rows.every((row) => row.year < 2024)).toBe(true)
    expect(rows.map((row) => row.year)).not.toContain(2024)
    expect(rows.map((row) => row.year)).not.toContain(2025)
    expect(rows.map((row) => row.year)).not.toContain(2026)
    expect(Math.max(...rows.map((row) => row.year))).toBe(2023)
  })

  it('includes the target year once outcomes are revealed, but never later years', () => {
    const rows = timelineYears(history(), 2024, true)
    expect(rows.map((row) => row.year)).toContain(2024)
    expect(rows.map((row) => row.year)).not.toContain(2025)
    expect(rows.map((row) => row.year)).not.toContain(2026)
    expect(Math.max(...rows.map((row) => row.year))).toBe(2024)
  })

  it('never carries scored_probability or actual_outcome through', () => {
    const rows = timelineYears(history(), 2024, true)
    for (const row of rows) {
      expect(row).not.toHaveProperty('scored_probability')
      expect(row).not.toHaveProperty('actual_outcome')
      expect(Object.keys(row).sort()).toEqual(['crash_count', 'severe_count', 'year'])
    }
  })

  it('holds for a 2025 target as well', () => {
    const unrevealed = timelineYears(history(), 2025, false)
    expect(Math.max(...unrevealed.map((row) => row.year))).toBe(2024)
    const revealed = timelineYears(history(), 2025, true)
    expect(Math.max(...revealed.map((row) => row.year))).toBe(2025)
    expect(revealed.map((row) => row.year)).not.toContain(2026)
  })

  it('returns years in ascending order', () => {
    const rows = timelineYears(history(), 2024, false)
    const sorted = [...rows].sort((a, b) => a.year - b.year)
    expect(rows).toEqual(sorted)
  })
})

describe('lookbackYears', () => {
  it('returns exactly the five years that fed the model', () => {
    const rows = lookbackYears(history(), 2024)
    expect(rows.map((row) => row.year)).toEqual([2019, 2020, 2021, 2022, 2023])
  })
})

describe('mostRecentPriorCrashYear', () => {
  it('ignores the target year and later', () => {
    expect(mostRecentPriorCrashYear(history(), 2024)).toBe(2023)
  })

  it('returns null when nothing was recorded before the target year', () => {
    const empty = history().map((row) => ({ ...row, crash_count: 0 }))
    expect(mostRecentPriorCrashYear(empty, 2024)).toBeNull()
  })
})

describe('timelineSummary', () => {
  it('describes the chart in words for screen readers', () => {
    const summary = timelineSummary(lookbackYears(history(), 2024))
    expect(summary).toContain('2019')
    expect(summary).toContain('2023')
    expect(summary).not.toContain('2024')
  })

  it('handles an empty history', () => {
    expect(timelineSummary([])).toContain('No crash history')
  })
})
