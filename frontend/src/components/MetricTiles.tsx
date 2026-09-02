import { useState } from 'react'
import { motion } from 'motion/react'
import { fadeIn, staggerParent, transition } from '../lib/motion'
import type { BacktestMetrics } from '../lib/backtestMetrics'
import { formatLift, formatPercent } from '../lib/backtestMetrics'
import { LIFT_EXPLANATION, LOOKBACK_LABEL, MASKED_VALUE, RECALL_EXPLANATION } from '../lib/copy'

interface MetricTilesProps {
  targetYear: number
  region: string
  eligibleInScope: number
  capacity: number
  coverage: number
  /**
   * Present only once the analyst has revealed outcomes. Undefined keeps every
   * outcome-derived number out of the rendered tree entirely.
   */
  metrics?: BacktestMetrics
  /** Previous selection's numbers, still on screen while the next set loads. */
  stale?: boolean
}

function Tile({
  label,
  value,
  detail,
  accent,
  masked,
  info,
}: {
  label: string
  value: string
  detail: string
  accent?: boolean
  masked?: boolean
  /** Plain-language explanation, shown on hover and focus. */
  info?: string
}) {
  const className = ['metric', accent ? 'accent' : '', masked ? 'masked' : '']
    .filter(Boolean)
    .join(' ')
  const tileId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const [open, setOpen] = useState(false)
  return (
    <motion.article className={className} variants={fadeIn}>
      <div className="metric-label">
        {label}
        {info && (
          /* The bubble is rendered rather than using title=: Chrome suppresses a
             native tooltip on an element that has an aria-label, and the delay
             before one appears makes it easy to miss. */
          <span
            className="metric-info-wrap"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            <button
              type="button"
              className="metric-info"
              aria-describedby={`${tileId}-info`}
              aria-label={`About ${label}`}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onClick={() => setOpen((v) => !v)}
            >
              i
            </button>
            <span
              className="metric-tooltip"
              id={`${tileId}-info`}
              role="tooltip"
              hidden={!open}
            >
              {info}
            </span>
          </span>
        )}
      </div>
      {/* Keyed so a reveal crossfades rather than mutating in place: masked and
          revealed values differ in font, size and family. The revealed value is
          never pre-mounted behind an invisible layer — outcome data must not be
          in the DOM before reveal. */}
      <motion.div
        key={masked ? 'masked' : 'value'}
        className="metric-value"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={transition}
      >
        {value}
      </motion.div>
      <div className="metric-detail">{detail}</div>
    </motion.article>
  )
}

export function MetricTiles({
  targetYear,
  region,
  eligibleInScope,
  capacity,
  coverage,
  metrics,
  stale,
}: MetricTilesProps) {
  const queueShare = eligibleInScope > 0 ? capacity / eligibleInScope : null

  return (
    <motion.section
      className={`metrics${stale ? ' is-stale' : ''}`}
      aria-busy={stale || undefined}
      aria-label="Backtest summary"
      variants={staggerParent}
      initial="hidden"
      animate="visible"
    >
      <Tile
        label="Eligible areas"
        value={eligibleInScope.toLocaleString('en-NZ')}
        detail={`Crash recorded in ${LOOKBACK_LABEL(targetYear)}`}
      />
      <Tile
        label="Outcome coverage"
        value={formatPercent(coverage)}
        detail={`${formatPercent(1 - coverage)} were not assessable`}
      />
      <Tile
        label="Review queue"
        value={String(Math.min(capacity, eligibleInScope))}
        detail={`${formatPercent(queueShare)} of eligible areas`}
      />

      {/* The last two tiles are derived from actual_outcome. Before reveal they
          are replaced entirely, so no outcome value reaches the DOM. */}
      {metrics ? (
        <Tile
          accent
          label="Severe-crash areas found"
          value={formatPercent(metrics.recallAtK)}
          detail={`${metrics.captured} of ${metrics.positives} · ceiling ${formatPercent(
            metrics.recallCeiling,
          )}`}
          info={RECALL_EXPLANATION({
            targetYear,
            region,
            positives: metrics.positives,
            // metrics.k is the capacity actually reachable: computeBacktestMetrics
            // caps the slider value at the population size.
            capacity: metrics.k,
            captured: metrics.captured,
            shareOfCatchable: formatPercent(
              metrics.k > 0 ? metrics.captured / metrics.k : null,
              0,
            ),
          })}
        />
      ) : (
        <Tile accent masked label="Severe-crash areas found" value={MASKED_VALUE} detail="" />
      )}

      {metrics ? (
        <Tile
          label="Lift over random review"
          value={formatLift(metrics.lift)}
          detail={`Random review: ${formatPercent(metrics.prevalence)}`}
          info={LIFT_EXPLANATION({
            capacity: metrics.k,
            // What a random pick of the same size would have turned up.
            randomHits: Math.round(metrics.k * (metrics.prevalence ?? 0)),
            captured: metrics.captured,
            // "8 times", not "8.0 times": the trailing zero reads as false precision
            // in a sentence, though it belongs on the tile's own value.
            lift: `${(metrics.lift ?? 0).toFixed(1).replace(/\.0$/, '')} times`,
          })}
        />
      ) : (
        <Tile masked label="Lift over random review" value={MASKED_VALUE} detail="" />
      )}
    </motion.section>
  )
}
