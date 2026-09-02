import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { transition } from '../../lib/motion'
import type { RunState } from '../../App'
import type { AreaScore } from '../../api/schemas'
import { usePopulation } from '../../api/queries'
import { Controls, SimulationTarget, type FilterState } from '../../components/Controls'
import { MetricTiles } from '../../components/MetricTiles'
import { CellMap } from '../../components/CellMap'
import { QueueTable } from '../../components/QueueTable'
import { AreaDrawer } from '../../components/AreaDrawer'
import { computeBacktestMetrics } from '../../lib/backtestMetrics'
import {
  ALL_NEW_ZEALAND,
  APP_TAGLINE,
  REVEAL_HIDDEN_TEXT,
  REVEAL_HIDDEN_TITLE,
  REVEAL_SHOWN_TEXT,
  REVEAL_SHOWN_TITLE,
  displayRegion,
} from '../../lib/copy'
import regions from '../../data/regions.json'
import type { useShortlist } from '../../lib/useShortlist'

interface PrioritisationViewProps {
  run: RunState
  setRun: (updater: (current: RunState) => RunState) => void
  years: number[]
  modelVersion: string | undefined
  shortlist: ReturnType<typeof useShortlist>
  banner: ReactNode
}

export function PrioritisationView({
  run,
  setRun,
  years,
  shortlist,
  banner,
}: PrioritisationViewProps) {
  const [selected, setSelected] = useState<AreaScore | undefined>()

  const query = useMemo(
    () => ({
      region: run.region || undefined,
      tla: run.filters.tla || undefined,
      historySufficiency: run.filters.historySufficiency || undefined,
      minPriorCrashes: run.filters.minPriorCrashes || undefined,
    }),
    [run.region, run.filters],
  )

  const population = usePopulation(run.year, query)

  // Region-only eligible count for the first tile, independent of the optional
  // filters so the denominator does not move when the analyst narrows the view.
  const scopeQuery = useMemo(() => ({ region: run.region || undefined }), [run.region])
  const scopePopulation = usePopulation(run.year, scopeQuery)

  /**
   * The last successfully loaded population, held across a failure.
   *
   * placeholderData does not survive an error: React Query substitutes it only
   * while the query is pending, so a failed switch drops data back to undefined
   * and would unmount the section — reintroducing the scroll jump on the one
   * path where losing your place is most annoying. Holding the last good result
   * keeps the page stable and lets the failure be reported in place.
   */
  const lastGoodRef = useRef<typeof population.data>(undefined)
  if (population.data && !population.isPlaceholderData) lastGoodRef.current = population.data
  const failedWithFallback = population.isLoadingError && !!lastGoodRef.current
  const shown = population.data ?? (failedWithFallback ? lastGoodRef.current : undefined)

  /**
   * True while the rows on screen belong to the previous selection: either the
   * next one is still in flight, or it failed and we are holding the last good
   * result. The section stays mounted throughout — that is what stops the page
   * jumping — so this flag is what stops the stale rows being passed off as the
   * current selection, and what gates the actions that would persist them.
   *
   * Both queries are checked: they are separate fetches that settle at
   * different times (22 sequential pages nationally against 4 for a region), so
   * either one lagging means the page is not yet internally consistent.
   */
  const stale =
    population.isPlaceholderData || scopePopulation.isPlaceholderData || failedWithFallback

  const areas = shown?.areas ?? []
  const meta = shown?.meta

  /**
   * The scope the rendered rows actually belong to, which during the stale
   * window is NOT run.region. Read back off the payload rather than from the
   * selection so the heading, the prose and — critically — the national/regional
   * rank switch all describe the numbers on screen.
   */
  const renderedRegion = shown?.query.region ?? ''
  const renderedYear = shown?.year ?? run.year

  /**
   * Derived from the rendered rows, never from the selection. Flipping this
   * ahead of the data would make QueueTable read national_rank off a regional
   * subset (a non-contiguous 1, 4, 9, 17… column) and make buildCellCollection
   * band the map on the wrong percentile ramp.
   */
  const useNationalRank = renderedRegion === ''

  /**
   * Only trust the scope query's count once it agrees with the rows on screen.
   * The two settle independently, so without this check a stale scope number
   * silently wins over a fresh one through the fallback below.
   */
  const scopeMatchesRendered =
    (scopePopulation.data?.query.region ?? '') === renderedRegion &&
    scopePopulation.data?.year === renderedYear
  const eligibleInScope =
    (scopeMatchesRendered ? scopePopulation.data?.meta.total_matching : undefined) ??
    meta?.total_matching ??
    0

  /**
   * Outcome-derived values are computed only after reveal. Before then the
   * result is undefined, so nothing derived from actual_outcome exists in the
   * rendered tree at all.
   */
  const metrics = useMemo(
    () => (run.revealed && areas.length > 0 ? computeBacktestMetrics(areas, run.capacity) : undefined),
    [run.revealed, areas, run.capacity],
  )

  // Keep the drawer's copy of an area in step with the loaded population.
  useEffect(() => {
    if (!selected) return
    const fresh = areas.find((area) => area.cell_id === selected.cell_id)
    if (fresh && fresh !== selected) setSelected(fresh)
  }, [areas, selected])

  // Also on filters: a TLA or history change swaps the population too, and
  // would otherwise leave the drawer open over rows it no longer belongs to.
  useEffect(() => {
    setSelected(undefined)
  }, [run.year, run.region, run.filters])

  /**
   * Selection and shortlisting are blocked while stale. The section no longer
   * unmounts, so the previous selection's rows stay a live click target — a new
   * interaction surface. Shortlist entries capture region, probability and
   * regional_rank off the area, and shortlistStore deliberately makes those
   * un-updatable (only status and notes can be patched), so a click landing in
   * this window writes an entry that can never be corrected. Worst case is a
   * year change: entries are keyed by year with no target_year on the entry, so
   * a 2024 area filed under 2025 is undetectable.
   */
  const handleSelect = useCallback(
    (area: AreaScore) => {
      if (stale) return
      setSelected(area)
    },
    [stale],
  )

  const handleToggleShortlist = useCallback(
    (area: AreaScore) => {
      if (stale) return
      shortlist.toggle(area)
    },
    [stale, shortlist],
  )

  // Named from the rendered rows, not the selection: during the stale window
  // these two differ, and the label must describe the numbers on screen.
  const regionLabel = renderedRegion ? displayRegion(renderedRegion) : 'New Zealand'

  return (
    <main className="workspace">
      <section className="heading">
        <div>
          <h1>Road area prioritisation</h1>
          <p>{APP_TAGLINE}</p>
        </div>

        <SimulationTarget
          years={years}
          year={run.year}
          onYearChange={(year) => setRun((current) => ({ ...current, year, revealed: false }))}
          revealed={run.revealed}
          onRevealedChange={(revealed) => setRun((current) => ({ ...current, revealed }))}
        />
      </section>

      {banner}

      <Controls
        region={run.region}
        onRegionChange={(region) => setRun((current) => ({ ...current, region }))}
        capacity={run.capacity}
        onCapacityChange={(capacity) => setRun((current) => ({ ...current, capacity }))}
        filters={run.filters}
        onFiltersChange={(filters: FilterState) => setRun((current) => ({ ...current, filters }))}
      />

      <MetricTiles
        targetYear={run.year ?? 0}
        region={regionLabel}
        eligibleInScope={eligibleInScope}
        capacity={run.capacity}
        coverage={meta?.eligible_coverage ?? 0}
        metrics={metrics}
        stale={stale}
      />

      {/* isPending, not isLoading: with placeholderData in play a region change
          rewrites the query status to success, so isLoading is false throughout
          the stale window and this panel would silently stop rendering.
          isPending is true only when there is genuinely nothing to show. */}
      {population.isPending && run.year !== undefined && (
        <div className="panel">
          <div className="loading">Loading eligible areas…</div>
        </div>
      )}

      {/* Only when there is nothing to fall back to. A failure that still has
          previous rows is reported inside the section, which stays mounted. */}
      {population.isLoadingError && !failedWithFallback && (
        <div className="panel">
          <div className="error-state">{(population.error as Error).message}</div>
        </div>
      )}

      {shown && (
        // Opacity only: this section is ~700px, and animating its height on
        // every region change would be both janky and slow to read.
        // Kept mounted across region changes by placeholderData. Unmounting it
        // shrinks the document, which makes the browser clamp the scroll to the
        // top and destroys focus on the select inside this very header. Do not
        // add a key here — remounting would silently revert that.
        <motion.section
          className={`analysis${stale ? ' is-stale' : ''}`}
          aria-busy={stale || undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transition}
        >
          {failedWithFallback && (
            <div className="stale-error" role="alert">
              <strong>
                Could not load {run.region ? displayRegion(run.region) : ALL_NEW_ZEALAND}
              </strong>
              <span>
                {(population.error as Error).message}. Still showing {regionLabel}.
              </span>
              <button type="button" className="button" onClick={() => population.refetch()}>
                Try again
              </button>
            </div>
          )}
          <article className="panel">
            <header className="panel-header">
              <div className="panel-title">
                <div>
                  <h2>
                    {/* The select is the whole heading, so it needs a label of
                        its own: without one it would announce only the region
                        name, with no indication of what it selects. */}
                    <label className="sr-only" htmlFor="panel-region">
                      Region
                    </label>
                    <select
                      id="panel-region"
                      className="panel-region-select"
                      value={run.region}
                      onChange={(event) => {
                        const region = event.target.value
                        // Same reset the controls-bar select makes: a TLA held
                        // over from the previous region matches nothing, and
                        // the queue would silently come back empty.
                        setRun((current) => ({
                          ...current,
                          region,
                          filters: { ...current.filters, tla: '' },
                        }))
                      }}
                    >
                      <option value="">{ALL_NEW_ZEALAND}</option>
                      {Object.keys(regions).map((name) => (
                        <option key={name} value={name}>
                          {displayRegion(name)}
                        </option>
                      ))}
                    </select>
                  </h2>
                  <p>
                    The areas are 1 km by 1 km grid squares that recorded at least one road
                    crash in the past five years. Deeper red squares rank higher within{' '}
                    {/* regionLabel, not run.region: while a new selection loads
                        the select above already shows the new region but these
                        rows are still the previous one's, and this sentence has
                        to describe the squares actually on the map. */}
                    {regionLabel}. The colour shows review priority, not road safety.
                  </p>
                  {stale && (
                    <p className="stale-note">
                      Loading {run.region ? displayRegion(run.region) : ALL_NEW_ZEALAND}. Figures
                      below are still {regionLabel}.
                    </p>
                  )}
                </div>
              </div>
            </header>

            <CellMap
              areas={areas}
              capacity={run.capacity}
              revealed={run.revealed}
              selectedCellId={selected?.cell_id}
              onSelect={handleSelect}
              useNationalRank={useNationalRank}
            />

            <footer className="reveal">
              <div className="reveal-copy">
                <span className="eye" aria-hidden="true">{run.revealed ? '◉' : '⊘'}</span>
                <div>
                  <strong>
                    {run.revealed ? REVEAL_SHOWN_TITLE(run.year ?? 0) : REVEAL_HIDDEN_TITLE}
                  </strong>
                  <span>{run.revealed ? REVEAL_SHOWN_TEXT : REVEAL_HIDDEN_TEXT}</span>
                </div>
              </div>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={run.revealed}
                  onChange={(event) =>
                    setRun((current) => ({ ...current, revealed: event.target.checked }))
                  }
                />
                Reveal outcomes
              </label>
            </footer>
          </article>

          <QueueTable
            targetYear={run.year ?? 0}
            population={areas}
            capacity={run.capacity}
            useNationalRank={useNationalRank}
            revealed={run.revealed}
            selectedCellId={selected?.cell_id}
            onSelect={handleSelect}
            isShortlisted={shortlist.has}
            onToggleShortlist={handleToggleShortlist}
          />
        </motion.section>
      )}

      {/* AnimatePresence keeps the drawer mounted through its exit animation. */}
      <AnimatePresence>
        {selected && (
          <AreaDrawer
            key={selected.cell_id}
            area={selected}
            revealed={run.revealed}
            useNationalRank={useNationalRank}
            entry={shortlist.entries.find((entry) => entry.cell_id === selected.cell_id)}
            onClose={() => setSelected(undefined)}
            onToggleShortlist={handleToggleShortlist}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
