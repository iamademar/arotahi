import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { DURATION, EASE, ROW_STAGGER } from '../lib/motion'
import type { AreaScore } from '../api/schemas'
import { NotScoredError } from '../api/client'
import { useArea } from '../api/queries'
import { capacitySplitsTie } from '../lib/backtestMetrics'

interface QueueTableProps {
  targetYear: number
  population: AreaScore[]
  capacity: number
  useNationalRank: boolean
  revealed: boolean
  selectedCellId?: string
  onSelect: (area: AreaScore) => void
  isShortlisted: (cellId: string) => boolean
  onToggleShortlist: (area: AreaScore) => void
}

export function QueueTable({
  targetYear,
  population,
  capacity,
  useNationalRank,
  revealed,
  selectedCellId,
  onSelect,
  isShortlisted,
  onToggleShortlist,
}: QueueTableProps) {
  const [search, setSearch] = useState('')
  const [showFull, setShowFull] = useState(false)

  /**
   * A search belongs to the population it was typed against: "Hamilton City"
   * carried into Auckland matches nothing, and a cell-id search would fire the
   * detail lookup and advise changing region — which is what just happened.
   * showFull is deliberately kept: it is a standing view preference, and
   * collapsing the queue would shrink the page.
   *
   * Previously incidental — the whole section unmounted on every region change,
   * taking both pieces of state with it. It stays mounted now.
   */
  useEffect(() => {
    setSearch('')
  }, [targetYear, useNationalRank, population])

  const trimmed = search.trim()
  const searching = trimmed.length > 0

  const filtered = useMemo(() => {
    if (!searching) return population
    const needle = trimmed.toLowerCase()
    return population.filter(
      (area) =>
        area.cell_id.toLowerCase().includes(needle) ||
        area.tla.toLowerCase().includes(needle),
    )
  }, [population, searching, trimmed])

  const visible = searching || showFull ? filtered : filtered.slice(0, capacity)

  // A cell id that matches nothing loaded may still be a real cell outside the
  // filtered view, or outside the eligible population entirely. Ask the API.
  const looksLikeCellId = /^NZTM1K-/i.test(trimmed)
  const shouldLookUp = searching && looksLikeCellId && filtered.length === 0
  const lookup = useArea(shouldLookUp ? targetYear : undefined, shouldLookUp ? trimmed : undefined)

  const splitsTie = !searching && !showFull && capacitySplitsTie(population, capacity)

  return (
    <article className="panel queue-panel">
      <header className="panel-header">
        <div className="panel-title">
          <div>
            <h2>
              Top <span>{Math.min(capacity, population.length)}</span> review queue
            </h2>
            <p>
              These are the top {Math.min(capacity, population.length)} areas, ranked by their
              estimated probability of a serious or fatal crash in {targetYear}.
            </p>
          </div>
        </div>
      </header>

      <label className="search">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Find cell or place</span>
        <input
          type="search"
          placeholder="Find cell or place"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      {shouldLookUp && lookup.isLoading && <div className="loading">Looking up {trimmed}…</div>}

      {shouldLookUp && lookup.error instanceof NotScoredError && (
        <div className="not-assessed" role="status">
          <strong>Not assessed</strong>
          <code>{lookup.error.cellId}</code>
          <p>{lookup.error.reason}</p>
        </div>
      )}

      {shouldLookUp && lookup.error && !(lookup.error instanceof NotScoredError) && (
        <div className="not-assessed" role="status">
          <strong>No result</strong>
          <p>{(lookup.error as Error).message}</p>
        </div>
      )}

      {shouldLookUp && lookup.data && (
        <div className="not-assessed" role="status">
          <strong>Outside the current filters</strong>
          <code>{lookup.data.cell_id}</code>
          <p>
            This area is in {lookup.data.tla}, {lookup.data.region}, and is not part of the queue
            you are viewing. Change the region or filters to see it ranked.
          </p>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Area</th>
              <th scope="col">Estimated probability</th>
              {/* The outcome column exists only after reveal. */}
              {revealed && <th scope="col">Serious or fatal crash in {targetYear}</th>}
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((area, index) => {
              const rank = useNationalRank ? area.national_rank : area.regional_rank
              const shortlisted = isShortlisted(area.cell_id)
              const beyond = !searching && index >= capacity
              return (
                <motion.tr
                  key={area.cell_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: DURATION,
                    ease: EASE,
                    // Capped: fifty rows at a full stagger would leave the table
                    // unreadable for seconds. Only the first rows are offset.
                    delay: Math.min(index, 12) * ROW_STAGGER,
                  }}
                  className={[
                    area.cell_id === selectedCellId ? 'selected' : '',
                    beyond ? 'beyond-capacity' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td>
                    <span className="rank">{rank}</span>
                  </td>
                  <td>
                    <button type="button" className="area-link" onClick={() => onSelect(area)}>
                      <strong>{area.tla}</strong>
                      <small>{area.cell_id}</small>
                    </button>
                  </td>
                  <td>
                    <div className="probability">
                      <span className="probability-track">
                        <i style={{ width: `${Math.max(4, area.probability * 100)}%` }} />
                      </span>
                      {/* Text always accompanies the bar: never colour or length alone. */}
                      <span className="probability-value">
                        {(area.probability * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  {revealed && (
                    <td>
                      {area.actual_outcome === 1 ? (
                        <span className="outcome-occurred">▲ Occurred</span>
                      ) : (
                        <span className="outcome-none">None</span>
                      )}
                    </td>
                  )}
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="button icon"
                        title={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                        aria-pressed={shortlisted}
                        onClick={() => onToggleShortlist(area)}
                      >
                        {shortlisted ? '✓' : '＋'}
                        <span className="sr-only">
                          {shortlisted ? 'Remove from shortlist' : 'Add to shortlist'} {area.cell_id}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="button icon"
                        title="Inspect area"
                        onClick={() => onSelect(area)}
                      >
                        ›<span className="sr-only">Inspect {area.cell_id}</span>
                      </button>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
            {visible.length === 0 && !shouldLookUp && (
              <tr>
                <td colSpan={revealed ? 5 : 4}>
                  <div className="empty-state">No areas match this search.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {splitsTie && (
        <p className="tie-note">
          Areas either side of this capacity share the same estimated probability. The order within
          a tie is arbitrary, so the cut-off does not distinguish them.
        </p>
      )}

      <footer className="queue-footer">
        <span>
          {searching
            ? `${visible.length.toLocaleString('en-NZ')} matching areas`
            : `Showing ${visible.length.toLocaleString('en-NZ')} of ${population.length.toLocaleString('en-NZ')} eligible areas`}
        </span>
        {!searching && population.length > capacity && (
          <button type="button" onClick={() => setShowFull((open) => !open)}>
            {showFull ? 'Show review capacity only' : 'View full queue →'}
          </button>
        )}
      </footer>
    </article>
  )
}
