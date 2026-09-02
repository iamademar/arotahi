import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { DURATION, EASE, transition } from '../lib/motion'
import type { AreaScore } from '../api/schemas'
import { useAreaHistory } from '../api/queries'
import { BAND_LABELS, percentileBand } from '../geo/cellGeometry'
import { LOOKBACK_LABEL } from '../lib/copy'
import {
  lookbackYears,
  mostRecentPriorCrashYear,
  timelineSummary,
} from '../lib/timeline'
import type { ShortlistEntry } from '../lib/shortlistStore'

interface AreaDrawerProps {
  area: AreaScore
  revealed: boolean
  useNationalRank: boolean
  entry?: ShortlistEntry
  onClose: () => void
  onToggleShortlist: (area: AreaScore) => void
}

export function AreaDrawer({
  area,
  revealed,
  useNationalRank,
  entry,
  onClose,
  onToggleShortlist,
}: AreaDrawerProps) {
  const history = useAreaHistory(area.cell_id)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [area.cell_id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const rank = useNationalRank ? area.national_rank : area.regional_rank
  const percentile = useNationalRank ? area.national_percentile : area.regional_percentile
  const scopeLabel = useNationalRank ? 'New Zealand' : area.region.replace(/ Region$/, '')

  const rows = history.data ? lookbackYears(history.data.years, area.target_year) : []
  const maxCrashes = rows.reduce((max, row) => Math.max(max, row.crash_count), 0)
  const recentYear = history.data
    ? mostRecentPriorCrashYear(history.data.years, area.target_year)
    : null

  return (
    <motion.div
      className="backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawerTitle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {/* Slides on x only: the panel stays fully opaque so the close button,
          focused on mount, is never focused while invisible. */}
      <motion.aside
        className="drawer"
        initial={{ x: 32 }}
        animate={{ x: 0 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: DURATION, ease: EASE }}
      >
        <div className="drawer-header">
          <button
            type="button"
            className="drawer-close"
            ref={closeRef}
            aria-label="Close area detail"
            onClick={onClose}
          >
            ×
          </button>

          <div className="drawer-kicker">
            {useNationalRank ? 'National' : 'Regional'} rank #{rank}
          </div>
          <h2 id="drawerTitle">{area.tla}</h2>
          <div className="drawer-id">{area.cell_id} · 1 km recurring crash area</div>
        </div>

        <div className="score-block">
          <div>
            <div className="label">Estimated probability</div>
            <div className="score">{(area.probability * 100).toFixed(1)}%</div>
            {/* The caption names the target year, so it is kept with the
                outcomes it refers to rather than shown alongside a hidden run.
                Deliberate: the percentage stands alone until outcomes are
                revealed. */}
            {revealed && (
              <small>
                At least one reported serious/fatal crash in {area.target_year}
              </small>
            )}
          </div>
          <div className="percentile">
            <strong>{(percentile * 100).toFixed(1)}</strong>
            <span>
              percentile
              <br />
              in {scopeLabel}
            </span>
            {/* Band always carries a text label: never colour alone. */}
            <span className="band">{BAND_LABELS[percentileBand(percentile)]}</span>
          </div>
        </div>

        <section className="detail-section">
          <h3>
            Five-year crash history <span>{LOOKBACK_LABEL(area.target_year)}</span>
          </h3>
          <div className="history-stats">
            <div className="history-stat">
              <strong>{area.prior_crash_count}</strong>
              <small>All crashes</small>
            </div>
            <div className="history-stat">
              <strong>{area.prior_severe_count}</strong>
              <small>Serious/fatal</small>
            </div>
            <div className="history-stat">
              <strong>{recentYear ?? '—'}</strong>
              <small>Most recent</small>
            </div>
          </div>

          {history.isLoading && <div className="loading">Loading history…</div>}

          {rows.length > 0 && (
            <>
              {/* The bars are scaled to this area's own maximum, so a full-height
                  bar means 4 crashes here and 40 somewhere else. The axis exists
                  to pin that top of scale to a number: without it the chart
                  invites a cross-area comparison its geometry cannot support. */}
              <div className="timeline-chart">
                <div className="pipeline-label">Reported crashes</div>
                <div className="timeline-plot">
                  {/* Hidden from assistive tech on purpose: the chart's aria-label
                      and the .sr-only summary below already read every value in
                      prose, so bare tick numbers would only add noise. */}
                  <div className="timeline-axis" aria-hidden="true">
                    {/* A five-year run with no crashes at all has no scale to
                        label, so only the baseline is marked. Printing 0 twice
                        would read as a broken axis. */}
                    {maxCrashes > 0 && <span className="tick-max">{maxCrashes}</span>}
                    <span className="tick-zero">0</span>
                  </div>
                  <div className="timeline" role="img" aria-label={timelineSummary(rows)}>
                    {rows.map((row, index) => (
                      <div className="timeline-col" key={row.year}>
                        <b>{row.crash_count}</b>
                        {/* The bar needs a track of its own: it is the column's
                            plot row, so the percentage height below resolves
                            against the band the gridlines bound rather than
                            against the column's labels too. */}
                        <div className="timeline-track">
                          {/* Grows from the baseline as the history lands. flex:0 0 auto
                              on the bar must stay, or flex-shrink flattens every year
                              to the same height whatever its value. */}
                          <motion.i
                            initial={{ height: 0 }}
                            animate={{
                              height: `${maxCrashes > 0 ? Math.max(2, (row.crash_count / maxCrashes) * 100) : 2}%`,
                            }}
                            transition={{ duration: DURATION, ease: EASE, delay: index * 0.04 }}
                          />
                        </div>
                        <span>{row.year}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="sr-only">{timelineSummary(rows)}</p>
            </>
          )}
        </section>

        <section className="detail-section">
          <h3>Historical inputs</h3>
          <div className="inputs-list">
            <div className="input-row">
              <span>Reported crashes in lookback</span>
              <strong>{area.prior_crash_count}</strong>
            </div>
            <div className="input-row">
              <span>Serious or fatal crashes in lookback</span>
              <strong>{area.prior_severe_count}</strong>
            </div>
            <div className="input-row">
              <span>Most recent prior crash year</span>
              <strong>{recentYear ?? 'None recorded'}</strong>
            </div>
            <div className="input-row">
              <span>History sufficiency</span>
              <strong>{area.history_sufficiency === 'low' ? 'Limited' : 'Sufficient'}</strong>
            </div>
          </div>
        </section>

        {area.history_sufficiency === 'low' && (
          <div className="limited-warning">
            <strong>⚠ Limited crash history</strong>
            <span>
              This estimate uses fewer than three prior records and is less stable. Keep it in the
              queue, but interpret it cautiously.
            </span>
          </div>
        )}

        <div className="drawer-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => onToggleShortlist(area)}
          >
            {entry ? '✓ Shortlisted' : '＋ Add to shortlist'}
          </button>
        </div>
        {revealed && (
          <p className="muted-note">
            {area.actual_outcome === 1
              ? `A serious or fatal crash was recorded here in ${area.target_year}.`
              : `No serious or fatal crash was recorded here in ${area.target_year}.`}
          </p>
        )}
      </motion.aside>
    </motion.div>
  )
}
