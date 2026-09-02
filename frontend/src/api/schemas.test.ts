import { describe, expect, it } from 'vitest'
import { areaScoreSchema, errorBodySchema, healthSchema, notScoredSchema } from './schemas'

const validArea = {
  cell_id: 'NZTM1K-1756-5919',
  target_year: 2024,
  probability: 0.9310344827586207,
  national_rank: 1,
  national_percentile: 1.0,
  regional_rank: 1,
  regional_percentile: 1.0,
  region: 'Auckland Region',
  tla: 'Auckland',
  history_sufficiency: 'sufficient',
  prior_crash_count: 557,
  prior_severe_count: 29,
  actual_outcome: 1,
  provenance: {
    model_version: 'cas-area-risk-1.0.0',
    grid_version: 'nztm-1km-origin0-v1',
    feature_schema_version: 'cas-area-features-1.0.0',
    source_snapshot_id: '967a34b12525',
  },
}

describe('areaScoreSchema', () => {
  it('accepts a real response', () => {
    expect(areaScoreSchema.parse(validArea).cell_id).toBe('NZTM1K-1756-5919')
  })

  it('rejects a response missing provenance', () => {
    const { provenance, ...withoutProvenance } = validArea
    void provenance
    expect(() => areaScoreSchema.parse(withoutProvenance)).toThrow()
  })

  it('rejects a provenance missing the source snapshot', () => {
    const partial = {
      ...validArea,
      provenance: { ...validArea.provenance, source_snapshot_id: undefined },
    }
    expect(() => areaScoreSchema.parse(partial)).toThrow()
  })
})

describe('healthSchema', () => {
  it('accepts eligible_cells with string keys, as JSON delivers them', () => {
    const health = healthSchema.parse({
      status: 'ok',
      model_version: 'cas-area-risk-1.0.0',
      trained_on_years: [2011, 2012],
      calibrated_on_years: [2019],
      years_available: [2024, 2025],
      eligible_cells: { '2024': 21396, '2025': 21183 },
    })
    expect(health.eligible_cells['2024']).toBe(21396)
  })
})

describe('errorBodySchema', () => {
  it('parses the not-scored 404 as an object', () => {
    const body = {
      detail: {
        cell_id: 'NZTM1K-1000-5000',
        target_year: 2024,
        status: 'not scored',
        reason: 'This cell is not in the eligible population for the target year.',
      },
    }
    const parsed = errorBodySchema.parse(body)
    expect(notScoredSchema.safeParse(parsed.detail).success).toBe(true)
  })

  it('parses a plain-string detail, as unknown-year 404s return', () => {
    const parsed = errorBodySchema.parse({
      detail: 'No scored run for 2023. Available years: [2024, 2025]',
    })
    expect(typeof parsed.detail).toBe('string')
    expect(notScoredSchema.safeParse(parsed.detail).success).toBe(false)
  })

  it('parses a 422 validation array', () => {
    const parsed = errorBodySchema.parse({
      detail: [{ type: 'string_pattern_mismatch', loc: ['query'], msg: 'String should match' }],
    })
    expect(Array.isArray(parsed.detail)).toBe(true)
  })
})
