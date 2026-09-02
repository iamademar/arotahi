import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  POP,
  VALUE_STAGGER,
  fadeIn,
  staggerParent,
  valueEnter,
  valueExit,
} from '../lib/motion'
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
  index = 0,
}: {
  label: string
  value: string
  detail: string
  accent?: boolean
  masked?: boolean
  /** Plain-language explanation, shown on hover and focus. */
  info?: string
  /** Position in the row, used only to stagger a figure-to-figure crossfade. */
  index?: number
}) {
  const className = ['metric', accent ? 'accent' : '', masked ? 'masked' : '']
    .filter(Boolean)
    .join(' ')
  const tileId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const [open, setOpen] = useState(false)
  /**
   * True only on the render that steps out of the masked state — the reveal,
   * and nothing else. A region change rewrites `value` while `masked` holds, so
   * this stays false and those figures crossfade without the spring.
   *
   * A ref rather than state: this is read during the same render that the
   * change arrives, and setting state here would need a second pass to apply
   * the transition the first pass had already chosen.
   */
  const wasMasked = useRef(masked)
  const revealing = wasMasked.current === true && masked !== true
  useEffect(() => {
    wasMasked.current = masked
  }, [masked])
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
      {/* The key carries the rendered text, so any change of figure crossfades
          rather than mutating in place — a reveal (masked to revealed) and a
          region change (one number to another) both land as an arrival rather
          than a hard cut. The masked flag stays in the key even though it is
          implied by the text: it is what decides the face and the timing below,
          and reading it here keeps the two in step.

          The revealed value is never pre-mounted behind an invisible layer —
          outcome data must not be in the DOM before reveal.

          The two nodes are stacked and crossfade together rather than being
          sequenced with mode="wait". Sequencing looked right in isolation but
          not here: the tile's own chrome — the accent rule, the detail line and
          the value font — switches on the same render, so holding the outgoing
          masked sentence meant briefly setting "Hidden until outcomes are
          revealed" in the revealed tile's display face, where it wrapped to
          three lines and shoved the page down before the figure landed.

          Absolute positioning keeps the outgoing node out of flow so the slot
          is sized by the incoming value alone; .metric-value-slot holds the
          height. */}
      <div className="metric-value-slot">
        {/* mode="wait": the outgoing figure finishes leaving before the next
            one starts arriving. The slot holds one number at a time, so the two
            never overlap and never fight over the slot's height.

            Neither alternative survived here. Crossfading them stacked left the
            old figure behind at full opacity whenever a change landed mid-exit
            — figures piled up and the tile showed the wrong number. popLayout
            pulled the exiting node out of flow while this slot was already
            stacking them itself, and the row collapsed. Sequencing is what the
            exit/enter split in lib/motion.ts is tuned for: the old number
            leaves in half the time the new one takes to arrive. */}
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${masked ? 'masked' : 'value'}:${value}`}
            /* The masked face is carried on the node, not on the tile: the tile's
               .masked class flips a render before this node exits, so a rule
               written as `.metric.masked .metric-value` would restyle the very
               text that is on its way out and set the masked sentence in the
               revealed display face mid-crossfade. */
            className={`metric-value${masked ? ' is-masked' : ''}`}
            /* The spring is the reveal's alone, and only on the accent tile —
               the headline of that gesture, landing with the outcome column and
               the map markers. A region change rewrites all five figures on one
               render, and five springs firing together reads as the row
               wobbling rather than as five answers arriving, so everything else
               crossfades. `revealing` is what separates the two: it is true only
               on the step out of the masked state, which is the reveal. */
            initial={{ opacity: 0, scale: accent && revealing ? 0.6 : 1 }}
            animate={{
              opacity: 1,
              scale: 1,
              transition:
                accent && revealing
                  ? POP
                  : { ...valueEnter, delay: revealing ? 0 : index * VALUE_STAGGER },
            }}
            exit={{ opacity: 0, transition: valueExit }}
            /* The slot is sized by whichever figure is in it, and with
               mode="wait" that is only ever one — so no positioning games are
               needed to keep the tile from resizing mid-change. */
          >
            {value}
          </motion.div>
        </AnimatePresence>
      </div>
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
        index={0}
        label="Eligible areas"
        value={eligibleInScope.toLocaleString('en-NZ')}
        detail={`Crash recorded in ${LOOKBACK_LABEL(targetYear)}`}
      />
      <Tile
        index={1}
        label="Outcome coverage"
        value={formatPercent(coverage)}
        detail={`${formatPercent(1 - coverage)} were not assessable`}
      />
      <Tile
        index={2}
        label="Review queue"
        value={String(Math.min(capacity, eligibleInScope))}
        detail={`${formatPercent(queueShare)} of eligible areas`}
      />

      {/* The last two tiles are derived from actual_outcome. Before reveal they
          are replaced entirely, so no outcome value reaches the DOM. */}
      {metrics ? (
        <Tile
          accent
          index={3}
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
        <Tile accent masked index={3} label="Severe-crash areas found" value={MASKED_VALUE} detail="" />
      )}

      {metrics ? (
        <Tile
          index={4}
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
        <Tile masked index={4} label="Lift over random review" value={MASKED_VALUE} detail="" />
      )}
    </motion.section>
  )
}
