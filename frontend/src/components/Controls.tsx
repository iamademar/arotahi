import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DURATION, EASE } from './../lib/motion'
import regions from '../data/regions.json'
import {
  ALL_NEW_ZEALAND,
  LOOKBACK_LABEL,
  REVEAL_HIDDEN_TEXT,
  REVEAL_SHOWN_TEXT,
  displayRegion,
} from '../lib/copy'

const REGIONS = regions as Record<string, string[]>

export interface FilterState {
  tla: string
  historySufficiency: '' | 'low' | 'sufficient'
  minPriorCrashes: number
}

export const EMPTY_FILTERS: FilterState = {
  tla: '',
  historySufficiency: '',
  minPriorCrashes: 0,
}

export function activeFilterCount(filters: FilterState): number {
  let count = 0
  if (filters.tla) count += 1
  if (filters.historySufficiency) count += 1
  if (filters.minPriorCrashes > 0) count += 1
  return count
}

interface ControlsProps {
  region: string
  onRegionChange: (region: string) => void
  capacity: number
  onCapacityChange: (capacity: number) => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

export function Controls({
  region,
  onRegionChange,
  capacity,
  onCapacityChange,
  filters,
  onFiltersChange,
}: ControlsProps) {
  // The advanced filters expand inline rather than floating, so there is no
  // click-outside or Escape dismissal to manage: the toggle button is the
  // only affordance that opens and closes them.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const regionNames = Object.keys(REGIONS)
  const tlas = region ? (REGIONS[region] ?? []) : []
  const filterCount = activeFilterCount(filters)
  // Range inputs cannot express "filled up to the thumb" in CSS alone.
  const fillPercent = ((capacity - 10) / 90) * 100

  return (
    <section className="controls" aria-label="Backtest settings">
      <div className="controls-header">
        <div className="field region">
          <label htmlFor="region">Region</label>
          <select
            id="region"
            value={region}
            onChange={(event) => {
              onRegionChange(event.target.value)
              // A TLA from the previous region would filter to nothing.
              onFiltersChange({ ...filters, tla: '' })
            }}
          >
            <option value="">{ALL_NEW_ZEALAND}</option>
            {regionNames.map((name) => (
              <option key={name} value={name}>
                {displayRegion(name)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="button more-toggle"
          aria-expanded={filtersOpen}
          aria-controls="advanced-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          ☷ More filters
          {filterCount > 0 && <span className="badge">{filterCount}</span>}
        </button>
      </div>

      {/* Unmounted when closed rather than hidden: that keeps the fields out of
          the accessibility tree and tab order for free, which an animated
          height alone would not. overflow:hidden lets the height collapse. */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            className="advanced-filters"
            id="advanced-filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="field">
              <label htmlFor="filter-tla">Territorial authority</label>
              <select
                id="filter-tla"
                value={filters.tla}
                onChange={(event) => onFiltersChange({ ...filters, tla: event.target.value })}
                disabled={!region}
              >
                <option value="">All in region</option>
                {tlas.map((tla) => (
                  <option key={tla} value={tla}>
                    {tla}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-history">History</label>
              <select
                id="filter-history"
                value={filters.historySufficiency}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    historySufficiency: event.target.value as FilterState['historySufficiency'],
                  })
                }
              >
                <option value="">Show all</option>
                <option value="sufficient">Sufficient only</option>
                <option value="low">Limited only</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="filter-min-crashes">Minimum prior crashes</label>
              <input
                id="filter-min-crashes"
                type="number"
                min={0}
                value={filters.minPriorCrashes}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    minPriorCrashes: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </div>

            <p className="filters-note">
              These narrow the view. They do not change the eligible population or how any area is
              scored.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="capacity">
        <div className="capacity-top">
          <label htmlFor="capacity">Review capacity</label>
          <strong>
            <span>{capacity}</span> areas
          </strong>
        </div>
        <input
          id="capacity"
          type="range"
          min={10}
          max={100}
          step={10}
          value={capacity}
          onChange={(event) => onCapacityChange(Number(event.target.value))}
          style={{
            background: `linear-gradient(to right, var(--color-action) 0 ${fillPercent}%, var(--color-surface-subtle) ${fillPercent}% 100%)`,
          }}
        />
        <div className="capacity-scale">
          <span>10</span>
          <span>100</span>
        </div>
      </div>

    </section>
  )
}

/**
 * The target year is the single most consequential setting on the page, so it
 * sits beside the heading rather than among the filters: it selects which run
 * is being simulated, while the controls bar only narrows what is shown.
 */
/**
 * The show/hide eye from password fields. Inline SVG rather than an emoji so it
 * inherits the button's text colour and stays monochrome like the rest of the UI.
 */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      className="eye"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {/* Draws itself on rather than blinking in: this is the clearest signal
          that toggling the button changed the run's state. */}
      <AnimatePresence>
        {off && (
          <motion.line
            x1="3"
            y1="21"
            x2="21"
            y2="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            exit={{ pathLength: 0 }}
            transition={{ duration: DURATION, ease: EASE }}
          />
        )}
      </AnimatePresence>
    </svg>
  )
}

export function SimulationTarget({
  years,
  year,
  onYearChange,
  revealed,
  onRevealedChange,
}: {
  years: number[]
  year: number | undefined
  onYearChange: (year: number) => void
  revealed: boolean
  onRevealedChange: (revealed: boolean) => void
}) {
  return (
    <aside className="simulation" aria-labelledby="simulation-label">
      <div className="simulation-label" id="simulation-label">
        Simulation target
      </div>
      {/* Reveal sits on the same row as the year it applies to: choosing a run
          and deciding whether to see its outcome are the same decision, one
          step apart, and side by side keeps the header a single compact band. */}
      <div className="simulation-row">
        <select
          id="year"
          value={year ?? ''}
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {/* The label no longer names the action, so aria-pressed is the only
            thing carrying on/off state to assistive technology: the eye icon
            is decorative and the text reads the same either way. */}
        <button
          type="button"
          className="reveal-toggle"
          aria-pressed={revealed}
          onClick={() => onRevealedChange(!revealed)}
        >
          <EyeIcon off={!revealed} />
          <span>{year} outcomes</span>
        </button>
      </div>
      {year !== undefined && (
        <p className="simulation-help">
          The model looks at crash records from {LOOKBACK_LABEL(year)} to rank areas by their
          chance of a serious or fatal crash.
        </p>
      )}
      <p className="reveal-hint">{revealed ? REVEAL_SHOWN_TEXT : REVEAL_HIDDEN_TEXT}</p>
    </aside>
  )
}
