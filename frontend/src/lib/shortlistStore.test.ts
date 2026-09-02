import { beforeEach, describe, expect, it } from 'vitest'
import {
  addToShortlist,
  readShortlist,
  removeFromShortlist,
  updateShortlistEntry,
} from './shortlistStore'
import type { AreaScore } from '../api/schemas'

const YEAR = 2024
const MODEL = 'cas-area-risk-1.0.0'

function area(overrides: Partial<AreaScore> = {}): AreaScore {
  return {
    cell_id: 'NZTM1K-1802-5814',
    target_year: YEAR,
    probability: 0.42,
    national_rank: 120,
    national_percentile: 0.99,
    regional_rank: 7,
    regional_percentile: 0.98,
    region: 'Waikato Region',
    tla: 'Hamilton City',
    history_sufficiency: 'sufficient',
    prior_crash_count: 40,
    prior_severe_count: 3,
    actual_outcome: 0,
    provenance: {
      model_version: MODEL,
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('shortlistStore', () => {
  it('captures the score and model version at selection', () => {
    addToShortlist(YEAR, MODEL, area())
    const [entry] = readShortlist(YEAR, MODEL)
    expect(entry.score_at_selection).toBe(0.42)
    expect(entry.model_version_at_selection).toBe(MODEL)
    expect(entry.analyst_status).toBe('Not reviewed')
  })

  it('leaves score_at_selection unchanged when the underlying score changes', () => {
    addToShortlist(YEAR, MODEL, area())

    // The same cell is later scored differently (a refit, a new snapshot).
    addToShortlist(YEAR, MODEL, area({ probability: 0.99, regional_rank: 1 }))

    const [entry] = readShortlist(YEAR, MODEL)
    expect(readShortlist(YEAR, MODEL)).toHaveLength(1)
    expect(entry.score_at_selection).toBe(0.42)
    expect(entry.regional_rank_at_selection).toBe(7)
  })

  it('does not let an analyst update touch the captured score', () => {
    addToShortlist(YEAR, MODEL, area())
    updateShortlistEntry(YEAR, MODEL, 'NZTM1K-1802-5814', {
      analyst_status: 'Engineering review proposed',
      notes: 'Checked against the local network plan.',
    })

    const [entry] = readShortlist(YEAR, MODEL)
    expect(entry.analyst_status).toBe('Engineering review proposed')
    expect(entry.notes).toBe('Checked against the local network plan.')
    expect(entry.score_at_selection).toBe(0.42)
    expect(entry.model_version_at_selection).toBe(MODEL)
  })

  it('keeps runs separate by year and model version', () => {
    addToShortlist(YEAR, MODEL, area())
    expect(readShortlist(2025, MODEL)).toHaveLength(0)
    expect(readShortlist(YEAR, 'cas-area-risk-2.0.0')).toHaveLength(0)
  })

  it('removes an entry', () => {
    addToShortlist(YEAR, MODEL, area())
    removeFromShortlist(YEAR, MODEL, 'NZTM1K-1802-5814')
    expect(readShortlist(YEAR, MODEL)).toHaveLength(0)
  })

  it('survives unreadable stored data', () => {
    localStorage.setItem(`cas-shortlist:${YEAR}:${MODEL}`, 'not json')
    expect(readShortlist(YEAR, MODEL)).toEqual([])
  })
})
