import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricTiles } from './MetricTiles'
import { computeBacktestMetrics } from '../lib/backtestMetrics'
import type { AreaScore } from '../api/schemas'

function population(): AreaScore[] {
  return Array.from({ length: 20 }, (_, index) => ({
    cell_id: `NZTM1K-1800-${5800 + index}`,
    target_year: 2024,
    probability: 1 - index * 0.04,
    national_rank: index + 1,
    national_percentile: 1 - index / 20,
    regional_rank: index + 1,
    regional_percentile: 1 - index / 20,
    region: 'Waikato Region',
    tla: 'Hamilton City',
    history_sufficiency: 'sufficient',
    prior_crash_count: 10,
    prior_severe_count: 1,
    actual_outcome: index < 4 ? 1 : 0,
    provenance: {
      model_version: 'cas-area-risk-1.0.0',
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
  }))
}

describe('MetricTiles reveal gating', () => {
  it('keeps every outcome-derived value out of the DOM before reveal', () => {
    const { container } = render(
      <MetricTiles
        targetYear={2024}
        region="Waikato"
        eligibleInScope={3690}
        capacity={5}
        coverage={0.8519}
      />,
    )

    // The masked tiles say so rather than showing a number.
    expect(screen.getAllByText('Hidden until outcomes are revealed')).toHaveLength(2)

    // No recall, lift or capture count is present anywhere in the rendered tree.
    const text = container.textContent ?? ''
    expect(text).not.toContain('66.7%')
    expect(text).not.toContain('×')
    expect(text).not.toMatch(/\d+ of \d+/)
    expect(text).not.toContain('ceiling')

    // The non-outcome tiles still render.
    expect(screen.getByText('3,690')).toBeInTheDocument()
    expect(screen.getByText('85.2%')).toBeInTheDocument()
  })

  it('shows recall with its ceiling and the capture count once revealed', () => {
    const metrics = computeBacktestMetrics(population(), 5)
    render(
      <MetricTiles
        targetYear={2024}
        region="Waikato"
        eligibleInScope={3690}
        capacity={5}
        coverage={0.8519}
        metrics={metrics}
      />,
    )

    expect(screen.queryByText('Hidden until outcomes are revealed')).not.toBeInTheDocument()
    // Recall is never shown without the ceiling that bounds it.
    expect(screen.getByText(/4 of 4 · ceiling/)).toBeInTheDocument()
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    expect(screen.getByText(/Random review:/)).toBeInTheDocument()
  })
})
