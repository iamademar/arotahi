import { describe, expect, it } from 'vitest'
import { capacitySplitsTie, computeBacktestMetrics } from './backtestMetrics'
import type { AreaScore } from '../api/schemas'

function area(probability: number, outcome: 0 | 1, index: number): AreaScore {
  return {
    cell_id: `NZTM1K-1800-${5800 + index}`,
    target_year: 2024,
    probability,
    national_rank: index + 1,
    national_percentile: 1 - index / 100,
    regional_rank: index + 1,
    regional_percentile: 1 - index / 100,
    region: 'Waikato Region',
    tla: 'Hamilton City',
    history_sufficiency: 'sufficient',
    prior_crash_count: 10,
    prior_severe_count: 1,
    actual_outcome: outcome,
    provenance: {
      model_version: 'cas-area-risk-1.0.0',
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
  }
}

/** 20 areas, ranked; the first 4 and two later ones are positive. */
function fixture(): AreaScore[] {
  const outcomes: (0 | 1)[] = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]
  return outcomes.map((outcome, index) => area(1 - index * 0.04, outcome, index))
}

describe('computeBacktestMetrics', () => {
  it('computes recall, precision and lift for a capacity', () => {
    const metrics = computeBacktestMetrics(fixture(), 5)

    expect(metrics.populationSize).toBe(20)
    expect(metrics.positives).toBe(6)
    expect(metrics.captured).toBe(4)
    expect(metrics.recallAtK).toBeCloseTo(4 / 6, 10)
    expect(metrics.precisionAtK).toBeCloseTo(4 / 5, 10)
    expect(metrics.prevalence).toBeCloseTo(6 / 20, 10)
    // precision 0.8 over a prevalence of 0.3
    expect(metrics.lift).toBeCloseTo(0.8 / 0.3, 10)
  })

  it('reports a ceiling below 1 when capacity is smaller than the positive count', () => {
    const metrics = computeBacktestMetrics(fixture(), 3)

    // Only 3 of the 6 positives can possibly be captured at this capacity.
    expect(metrics.recallCeiling).toBeCloseTo(3 / 6, 10)
    expect(metrics.recallAtK).toBeCloseTo(3 / 6, 10)
    expect(metrics.recallCeiling).toBeLessThan(1)
  })

  it('caps the ceiling at 1 when capacity exceeds the positive count', () => {
    const metrics = computeBacktestMetrics(fixture(), 20)
    expect(metrics.recallCeiling).toBe(1)
    expect(metrics.recallAtK).toBe(1)
  })

  it('returns nulls rather than NaN when there are no positives', () => {
    const population = fixture().map((row) => ({ ...row, actual_outcome: 0 as const }))
    const metrics = computeBacktestMetrics(population, 5)

    expect(metrics.positives).toBe(0)
    expect(metrics.recallAtK).toBeNull()
    expect(metrics.recallCeiling).toBeNull()
    expect(metrics.lift).toBeNull()
    expect(metrics.precisionAtK).toBe(0)
  })

  it('reproduces the observed Waikato 2024 figures', () => {
    // 3,690 eligible areas, 232 positive, 33 captured in the top 50 — measured
    // against the live service. Recall reads as 14% only because the ceiling at
    // this capacity is 21.6%.
    const population: AreaScore[] = []
    for (let i = 0; i < 3690; i += 1) {
      // First 50 hold 33 positives; the remaining 199 sit outside the queue.
      const positive = i < 50 ? i < 33 : i >= 50 && i < 50 + 199
      population.push(area(1 - i / 4000, positive ? 1 : 0, i))
    }
    const metrics = computeBacktestMetrics(population, 50)

    expect(metrics.positives).toBe(232)
    expect(metrics.captured).toBe(33)
    expect(metrics.recallAtK).toBeCloseTo(0.1422, 4)
    expect(metrics.recallCeiling).toBeCloseTo(0.2155, 4)
    expect(metrics.precisionAtK).toBeCloseTo(0.66, 4)
  })

  it('clamps capacity to the population size', () => {
    const metrics = computeBacktestMetrics(fixture(), 500)
    expect(metrics.k).toBe(20)
  })
})

describe('capacitySplitsTie', () => {
  it('detects a capacity cut falling inside a run of equal probabilities', () => {
    const population = [
      area(0.5, 1, 0),
      area(0.25, 0, 1),
      area(0.25, 0, 2),
      area(0.25, 0, 3),
    ]
    // Ranks 2 and 3 share a probability, so a cut at 2 is arbitrary.
    expect(capacitySplitsTie(population, 2)).toBe(true)
    // A cut at 1 separates 0.5 from 0.25, which is a real difference.
    expect(capacitySplitsTie(population, 1)).toBe(false)
  })

  it('is false at the edges', () => {
    const population = [area(0.5, 1, 0), area(0.25, 0, 1)]
    expect(capacitySplitsTie(population, 0)).toBe(false)
    expect(capacitySplitsTie(population, 2)).toBe(false)
  })
})
