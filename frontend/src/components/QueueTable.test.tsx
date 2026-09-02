import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QueueTable } from './QueueTable'
import type { AreaScore } from '../api/schemas'

const NOT_SCORED_REASON =
  'This cell is not in the eligible population for the target year: it recorded no crash in ' +
  'the previous five calendar years, so the model has no history to score it from. Treat it ' +
  'as not assessed, not as low risk.'

function area(index: number, outcome: 0 | 1 = 0): AreaScore {
  return {
    cell_id: `NZTM1K-1800-${5800 + index}`,
    target_year: 2024,
    probability: 0.9 - index * 0.05,
    national_rank: index + 1,
    national_percentile: 1 - index / 50,
    regional_rank: index + 1,
    regional_percentile: 1 - index / 50,
    region: 'Waikato Region',
    tla: 'Hamilton City',
    history_sufficiency: 'sufficient',
    prior_crash_count: 20,
    prior_severe_count: 2,
    actual_outcome: outcome,
    provenance: {
      model_version: 'cas-area-risk-1.0.0',
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
  }
}

function renderTable(props: Partial<Parameters<typeof QueueTable>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <QueueTable
        targetYear={2024}
        population={[area(0, 1), area(1), area(2)]}
        capacity={50}
        useNationalRank={false}
        revealed={false}
        onSelect={() => undefined}
        isShortlisted={() => false}
        onToggleShortlist={() => undefined}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QueueTable outcome gating', () => {
  it('omits the outcome column entirely before reveal', () => {
    const { container } = renderTable({ revealed: false })

    expect(
      screen.queryByRole('columnheader', { name: 'Serious or fatal crash in 2024' }),
    ).not.toBeInTheDocument()
    const text = container.textContent ?? ''
    expect(text).not.toContain('Occurred')
    expect(text).not.toContain('None')
  })

  it('adds the outcome column once revealed', () => {
    renderTable({ revealed: true })

    expect(
      screen.getByRole('columnheader', { name: 'Serious or fatal crash in 2024' }),
    ).toBeInTheDocument()
    expect(screen.getByText('▲ Occurred')).toBeInTheDocument()
  })
})

describe('QueueTable not-scored handling', () => {
  it('renders "Not assessed" with the API reason and no probability', async () => {
    // A cell outside the eligible population: the API answers 404 with a
    // structured detail, never with a low score.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: {
              cell_id: 'NZTM1K-1000-5000',
              target_year: 2024,
              status: 'not scored',
              reason: NOT_SCORED_REASON,
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    renderTable()
    await userEvent.type(
      screen.getByRole('searchbox', { name: /find cell or place/i }),
      'NZTM1K-1000-5000',
    )

    await waitFor(() => expect(screen.getByText('Not assessed')).toBeInTheDocument())

    // The API's own wording is shown verbatim.
    expect(screen.getByText(NOT_SCORED_REASON)).toBeInTheDocument()
    expect(screen.getByText('NZTM1K-1000-5000')).toBeInTheDocument()

    // Nothing that could read as a low risk score.
    const panel = screen.getByText('Not assessed').closest('.not-assessed')!
    expect(panel.textContent).not.toMatch(/\d+\.\d%/)
    expect(panel.textContent).not.toContain('probability')
  })

  it('does not call the detail endpoint for a search that matches loaded rows', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    renderTable()
    await userEvent.type(
      screen.getByRole('searchbox', { name: /find cell or place/i }),
      'Hamilton',
    )

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.getAllByText('Hamilton City').length).toBeGreaterThan(0)
  })
})

describe('QueueTable tie note', () => {
  it('warns when the capacity cut falls inside a run of equal probabilities', () => {
    const tied = [area(0), { ...area(1), probability: 0.25 }, { ...area(2), probability: 0.25 }]
    renderTable({ population: tied, capacity: 2 })
    expect(screen.getByText(/order within a tie is arbitrary/i)).toBeInTheDocument()
  })

  it('stays silent when the cut separates different probabilities', () => {
    renderTable({ population: [area(0), area(1), area(2)], capacity: 2 })
    expect(screen.queryByText(/order within a tie is arbitrary/i)).not.toBeInTheDocument()
  })
})
