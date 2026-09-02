import type { AreaScore } from '../api/schemas'

export interface BacktestMetrics {
  /** Review capacity: how many areas the analyst can actually look at. */
  k: number
  populationSize: number
  positives: number
  captured: number
  /** captured / positives. Null when the population holds no positives. */
  recallAtK: number | null
  /**
   * min(1, K / positives): the most recall any ranking could achieve at this
   * capacity. Without it a recall of 0.14 reads as failure when the ceiling is
   * 0.22 and the real result is roughly two thirds of what is attainable.
   */
  recallCeiling: number | null
  precisionAtK: number | null
  /** Share of the population that is positive: the random-review rate. */
  prevalence: number | null
  /** precisionAtK / prevalence. */
  lift: number | null
}

function countPositives(areas: AreaScore[]): number {
  let total = 0
  for (const area of areas) if (area.actual_outcome === 1) total += 1
  return total
}

/**
 * Backtest metrics for a capacity-limited queue.
 *
 * The population must already be in the API's rank order (highest probability
 * first); the API guarantees this and it is not re-sorted here, because the
 * server's ordering is the tiebreak of record.
 *
 * Only call this once outcomes have been revealed: every field is derived from
 * `actual_outcome` and is therefore outcome information itself.
 */
export function computeBacktestMetrics(
  population: AreaScore[],
  k: number,
): BacktestMetrics {
  const populationSize = population.length
  const capacity = Math.max(0, Math.min(k, populationSize))
  const queue = population.slice(0, capacity)

  const positives = countPositives(population)
  const captured = countPositives(queue)

  // With no positives, recall and lift are undefined rather than zero. Return
  // null so the UI can say so instead of rendering NaN or a misleading 0%.
  const hasPositives = positives > 0
  const prevalence = populationSize > 0 ? positives / populationSize : null
  const precisionAtK = capacity > 0 ? captured / capacity : null

  return {
    k: capacity,
    populationSize,
    positives,
    captured,
    recallAtK: hasPositives ? captured / positives : null,
    recallCeiling: hasPositives ? Math.min(1, capacity / positives) : null,
    precisionAtK,
    prevalence,
    lift:
      precisionAtK !== null && prevalence !== null && prevalence > 0
        ? precisionAtK / prevalence
        : null,
  }
}

/**
 * True when the capacity cut falls inside a run of equal probabilities, so the
 * areas at rank K and K+1 are indistinguishable to the model and the boundary
 * is arbitrary.
 */
export function capacitySplitsTie(population: AreaScore[], k: number): boolean {
  if (k <= 0 || k >= population.length) return false
  return population[k - 1].probability === population[k].probability
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatLift(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${value.toFixed(1)}×`
}
