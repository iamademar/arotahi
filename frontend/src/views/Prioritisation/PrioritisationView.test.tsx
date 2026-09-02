import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrioritisationView } from './PrioritisationView'
import type { RunState } from '../../App'
import type { AreaScore } from '../../api/schemas'
import { EMPTY_FILTERS } from '../../components/Controls'

/**
 * CellMap cannot run under jsdom: it calls maplibregl.setWorkerUrl at module
 * scope and constructs a Map against a container with no dimensions.
 */
vi.mock('../../components/CellMap', () => ({
  CellMap: () => <div data-testid="cell-map" />,
}))

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
  return { ...actual, getFullPopulation: vi.fn(), getAreaHistory: vi.fn() }
})

const { getFullPopulation } = await import('../../api/client')
const mockedFetch = vi.mocked(getFullPopulation)

/**
 * national_rank is deliberately offset from regional_rank. The two must never
 * be equal here: a test where they match cannot tell whether the queue read the
 * right one, which is the whole point of the rank-scope assertion below.
 */
function area(index: number, region: string): AreaScore {
  return {
    cell_id: `NZTM1K-1800-${5800 + index}`,
    target_year: 2024,
    probability: 0.9 - index * 0.05,
    national_rank: index + 501,
    national_percentile: 1 - index / 50,
    regional_rank: index + 1,
    regional_percentile: 1 - index / 50,
    region,
    tla: region === '' ? 'Hamilton City' : `${region} TLA`,
    history_sufficiency: 'sufficient',
    prior_crash_count: 20,
    prior_severe_count: 2,
    actual_outcome: 0,
    provenance: {
      model_version: 'cas-area-risk-1.0.0',
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
  }
}

function population(region: string) {
  return {
    meta: {
      target_year: 2024,
      total_matching: 3,
      limit: 1000,
      offset: 0,
      eligible_cells_in_year: 3,
      eligible_coverage: 0.9,
    },
    areas: [area(0, region), area(1, region), area(2, region)],
  }
}

/** Holds run state so the region select actually changes the query. */
function Harness() {
  const [run, setRun] = useState<RunState>({
    year: 2024,
    region: 'Auckland Region',
    capacity: 50,
    filters: EMPTY_FILTERS,
    revealed: false,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={client}>
      <PrioritisationView
        run={run}
        setRun={setRun}
        years={[2024]}
        modelVersion="cas-area-risk-1.0.0"
        shortlist={{
          entries: [],
          add: () => undefined,
          remove: () => undefined,
          update: () => undefined,
          toggle: vi.fn(),
          has: () => false,
        }}
        banner={null}
      />
    </QueryClientProvider>
  )
}

/** A promise this test resolves by hand, to hold the stale window open. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function renderLoaded() {
  mockedFetch.mockResolvedValue(population('Auckland Region'))
  render(<Harness />)
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PrioritisationView region switching', () => {
  it('keeps the analysis section mounted while a new region loads', async () => {
    await renderLoaded()

    // Captured node references. Re-querying after the change would pass
    // trivially once data lands; these pass only if nothing unmounted, which is
    // the testable proxy for "the document never shrank" (jsdom has no layout).
    const table = screen.getByRole('table')
    const select = screen.getByLabelText('Region', { selector: '#panel-region' })

    const pending = deferred<ReturnType<typeof population>>()
    mockedFetch.mockReturnValue(pending.promise)
    await userEvent.selectOptions(select, 'Waikato Region')

    expect(table).toBeInTheDocument()
    expect(select).toBeInTheDocument()
    expect(screen.queryByText('Loading eligible areas…')).not.toBeInTheDocument()

    pending.resolve(population('Waikato Region'))
  })

  it('marks the stale section busy and keeps the previous region name', async () => {
    await renderLoaded()
    const select = screen.getByLabelText('Region', { selector: '#panel-region' })

    const pending = deferred<ReturnType<typeof population>>()
    mockedFetch.mockReturnValue(pending.promise)
    await userEvent.selectOptions(select, 'Waikato Region')

    const section = document.querySelector('.analysis') as HTMLElement
    expect(section).toHaveAttribute('aria-busy', 'true')
    expect(section.className).toContain('is-stale')
    // The heading describes the rows on screen, which are still Auckland's.
    const panelHeading = section.querySelector('.panel-title h2') as HTMLElement
    expect(panelHeading.textContent).toContain('Auckland')

    pending.resolve(population('Waikato Region'))
    await waitFor(() => expect(section).not.toHaveAttribute('aria-busy'))
  })

  it('keeps regional ranks while a switch to all-of-NZ is in flight', async () => {
    await renderLoaded()
    const select = screen.getByLabelText('Region', { selector: '#panel-region' })

    const pending = deferred<ReturnType<typeof population>>()
    mockedFetch.mockReturnValue(pending.promise)
    await userEvent.selectOptions(select, '')

    // useNationalRank must follow the rendered rows, not the selection. If it
    // flipped early the first row would read 501, not 1.
    const firstRow = screen.getAllByRole('row')[1]
    expect(within(firstRow).getByText('1')).toBeInTheDocument()
    expect(within(firstRow).queryByText('501')).not.toBeInTheDocument()

    pending.resolve(population(''))
  })

  it('does not open the drawer for a click on stale rows', async () => {
    await renderLoaded()
    const select = screen.getByLabelText('Region', { selector: '#panel-region' })

    const pending = deferred<ReturnType<typeof population>>()
    mockedFetch.mockReturnValue(pending.promise)
    await userEvent.selectOptions(select, 'Waikato Region')

    await userEvent.click(screen.getAllByRole('row')[1])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    pending.resolve(population('Waikato Region'))
  })

  it('holds the last good rows and reports the failure in place', async () => {
    await renderLoaded()
    const table = screen.getByRole('table')
    const select = screen.getByLabelText('Region', { selector: '#panel-region' })

    mockedFetch.mockRejectedValue(new Error('Network unreachable'))
    await userEvent.selectOptions(select, 'Waikato Region')

    // placeholderData does not survive an error, so without the last-good
    // fallback the section would unmount here and the page would jump again.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(table).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toContain('Waikato')
  })

  it('still shows the loading panel on the first ever load', async () => {
    const pending = deferred<ReturnType<typeof population>>()
    mockedFetch.mockReturnValue(pending.promise)
    render(<Harness />)

    // isPending, not isLoading: the latter is false whenever placeholder data
    // is in play, which would silently disable this panel.
    expect(screen.getByText('Loading eligible areas…')).toBeInTheDocument()

    pending.resolve(population('Auckland Region'))
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })
})
