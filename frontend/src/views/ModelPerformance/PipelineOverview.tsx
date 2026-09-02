import { usePopulation } from '../../api/queries'
import { CellMap } from '../../components/CellMap'
import { parseCellId } from '../../geo/cellGeometry'
import type { AreaScore } from '../../api/schemas'
import { MAP_CONTEXT_NOTE, NOT_ASSESSED_LEGEND, displayRegion } from '../../lib/copy'

/**
 * The five-step explainer, rebuilt from the design export in
 * "Crash risk pipeline.html". The export's own header (eyebrow, h1 and rule) is
 * deliberately omitted: the panel around this component already titles it.
 *
 * The export was a fixed 1680px artboard of inline-styled divs. Here it is
 * class-driven so the app's tokens supply the palette, and the grid reflows
 * rather than holding five columns at every width.
 */

/**
 * Illustrative rows in the shape of the real extract, not a verbatim sample.
 * Years repeat, as they do in the source, so rows are keyed by index rather
 * than by year.
 */
const SAMPLE_ROWS = [
  ['2020', 'Serious', '80', 'No', 'Dark', 'Dry'],
  ['2022', 'Minor', '50', 'Yes', 'Light', 'Dry'],
  ['2024', 'Non-injury', '50', 'Yes', 'Wet', 'Wet'],
  ['2011', 'Minor', '100', 'No', 'Light', 'Dry'],
  ['2013', 'Non-injury', '50', 'Yes', 'Dark', 'Wet'],
  ['2015', 'Fatal', '100', 'No', 'Dark', 'Wet'],
  ['2016', 'Serious', '60', 'Yes', 'Twilight', 'Dry'],
  ['2018', 'Non-injury', '30', 'Yes', 'Light', 'Dry'],
  ['2019', 'Minor', '80', 'No', 'Light', 'Ice'],
  ['2021', 'Serious', '100', 'No', 'Dark', 'Wet'],
  ['2022', 'Non-injury', '50', 'Yes', 'Light', 'Dry'],
  ['2023', 'Minor', '60', 'Yes', 'Twilight', 'Wet'],
]

const COLUMNS = ['year', 'severity', 'speed', 'urban', 'light', 'surface']

/**
 * The worked example's centre cell, and the TLA it sits in. Hamilton City is
 * small enough (117 cells) to fetch whole, and this cell is one of the few with
 * all eight neighbours scored, so the 3x3 block draws complete.
 */
const EXAMPLE_CELL_ID = 'NZTM1K-1800-5815'
const EXAMPLE_TLA = 'Hamilton City'

/**
 * Step 5's worked region. displayRegion renders it as "Waikato"; the API needs
 * the full string. Scoping to one region is also lighter than the whole
 * country: ~3,700 rows over four paged requests rather than ~21,400 over 22.
 */
const EXAMPLE_REGION = 'Waikato Region'

/** The centre cell and its eight neighbours, derived rather than hardcoded. */
function neighbourhoodIds(cellId: string): string[] {
  const parsed = parseCellId(cellId)
  if (!parsed) return []
  const ids: string[] = []
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      ids.push(`NZTM1K-${parsed.ix + dx}-${parsed.iy + dy}`)
    }
  }
  return ids
}

/**
 * The published dataset this project's snapshot was taken from. Recorded in
 * spec_v2.md section 2, alongside the field descriptions, and used to confirm
 * the extract's 72-column schema.
 */
const CAS_SOURCE_URL =
  'https://opendata-nzta.opendata.arcgis.com/datasets/NZTA::crash-analysis-system-cas-data-1/about'
const CAS_FIELDS_URL =
  'https://opendata-nzta.opendata.arcgis.com/pages/cas-data-field-descriptions'

/** Label, value and bar width, exactly as proportioned in the design. */
const FEATURE_ROWS: [string, string, number][] = [
  ['Crashes, last 5 years', '12', 60],
  ['Serious or fatal', '3', 25],
  ['Median speed limit', '80 km/h', 73],
  ['Dark-condition crashes', '4', 33],
  ['Wet-road crashes', '3', 25],
  ['Neighbour crashes', '19', 95],
  ['Neighbour severe crashes', '4', 33],
]

const LOOKBACK_YEARS = ['2020', '2021', '2022', '2023', '2024']

// The worked example's numbers, carried over from the design: a point estimate
// of 14% against a 3.1% all-areas average, with a 9-21% interval.
const EXAMPLE_POINT = 0.14
const EXAMPLE_BASELINE = 0.031
const EXAMPLE_INTERVAL: [number, number] = [0.09, 0.21]

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="pipeline-step">
      <div className="pipeline-step-head">
        <div className="pipeline-step-number" aria-hidden="true">{number}</div>
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  )
}

/**
 * A single abstracted tree standing in for the ensemble. The export serialised
 * the viewBox as `sc-camel-view-box`, which no browser reads; it is restored
 * here so the drawing scales with its box.
 */
function TreeDiagram() {
  const edges = [
    [100, 16, 52, 52], [100, 16, 100, 52], [100, 16, 148, 52],
    [52, 52, 34, 88], [52, 52, 70, 88], [100, 52, 100, 88],
    [148, 52, 130, 88], [148, 52, 166, 88],
  ]
  return (
    <svg viewBox="0 0 200 120" className="pipeline-tree" aria-hidden="true">
      {edges.map(([x1, y1, x2, y2]) => (
        <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <circle cx={100} cy={16} r={6} className="pipeline-tree-root" />
      {[52, 100, 148].map((cx) => (
        <circle key={cx} cx={cx} cy={52} r={5} className="pipeline-tree-branch" />
      ))}
      {[34, 70, 100, 130, 166].map((cx) => (
        <circle key={cx} cx={cx} cy={88} r={5} className="pipeline-tree-leaf" />
      ))}
      <text x={184} y={58} className="pipeline-tree-more">…</text>
    </svg>
  )
}

/**
 * The calibrated-probability scale. The design referenced an external widget
 * that shipped no markup, so it is rebuilt from the props it was given.
 */
function ProbabilityScale() {
  const [low, high] = EXAMPLE_INTERVAL
  const asPercent = (value: number) => `${value * 100}%`
  return (
    <div className="pipeline-scale-wrap">
      <div className="pipeline-label">Calibrated probability</div>
      <div
        className="pipeline-scale"
        role="img"
        aria-label={`Estimated probability ${Math.round(EXAMPLE_POINT * 100)} percent, interval ${Math.round(low * 100)} to ${Math.round(high * 100)} percent, against an all-areas average of ${(EXAMPLE_BASELINE * 100).toFixed(1)} percent`}
      >
        <div
          className="pipeline-scale-band"
          style={{ left: asPercent(low), width: asPercent(high - low) }}
        />
        <div className="pipeline-scale-baseline" style={{ left: asPercent(EXAMPLE_BASELINE) }} />
        <div className="pipeline-scale-point" style={{ left: asPercent(EXAMPLE_POINT) }} />
      </div>
      <div className="pipeline-scale-axis">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <p className="pipeline-scale-note">
        The point is this area's estimated probability; the grey line is the all-areas average it
        has to beat.
      </p>
    </div>
  )
}

/**
 * The worked example's own neighbourhood, on the same live map step 5 uses.
 * Nine cells span 3 km, which the map's default fit caps at about 200 px in
 * this frame, so it opts into a closer ceiling. Not so close that the block
 * fills the frame: at 13 it is taller than the map and the outer cells clip,
 * so the 3x3 shape stops reading.
 */
function NeighbourhoodMap({ year }: { year: number | undefined }) {
  const population = usePopulation(year, { tla: EXAMPLE_TLA })
  const wanted = new Set(neighbourhoodIds(EXAMPLE_CELL_ID))
  const areas: AreaScore[] = (population.data?.areas ?? []).filter((area) =>
    wanted.has(area.cell_id),
  )

  if (population.isLoading || year === undefined) {
    return <div className="pipeline-map-state">Loading example area…</div>
  }
  if (population.error) {
    return (
      <div className="pipeline-map-state pipeline-map-error">
        {(population.error as Error).message}
      </div>
    )
  }
  // The example cell is fixed, so a data change could leave it unscored rather
  // than simply shifting its rank.
  if (areas.length === 0) {
    return <div className="pipeline-map-state">Example area not scored for {year}.</div>
  }
  return (
    <>
      <div className="pipeline-map pipeline-map-neighbourhood">
        <CellMap
          areas={areas}
          capacity={areas.length}
          revealed={false}
          onSelect={() => {}}
          useNationalRank={false}
          maxZoom={12.5}
          hoverInfo
        />
      </div>
      <div className="pipeline-map-notes">
        <span>ⓘ {MAP_CONTEXT_NOTE}</span>
        <span>{NOT_ASSESSED_LEGEND}</span>
      </div>
    </>
  )
}

/**
 * Step 5's worked region, and the top-ranked area within it. Map, inset and
 * figures come from one fetch so the "#1" the panel names is provably the same
 * row the map framed, rather than two queries that could drift apart.
 *
 * Ranking is regional throughout: the heading, the inset and the rank line all
 * say Waikato, so national banding would colour the cells against a scale the
 * surrounding copy does not use.
 */
function RegionalRankExample({ year }: { year: number | undefined }) {
  const population = usePopulation(year, { region: EXAMPLE_REGION })
  const areas: AreaScore[] = population.data?.areas ?? []
  const total = population.data?.meta.total_matching ?? 0

  if (population.isLoading || year === undefined) {
    return <div className="pipeline-map-state">Loading scored areas…</div>
  }
  if (population.error) {
    return (
      <div className="pipeline-map-state pipeline-map-error">
        {(population.error as Error).message}
      </div>
    )
  }
  // areas arrives in rank order, so the head is the region's top-ranked area.
  const top = areas[0]
  if (!top) {
    return <div className="pipeline-map-state">No scored areas for {year}.</div>
  }

  const wanted = new Set(neighbourhoodIds(top.cell_id))
  const neighbourhood = areas.filter((area) => wanted.has(area.cell_id))

  return (
    <>
      <div className="pipeline-map">
        <CellMap
          areas={areas}
          capacity={50}
          revealed={false}
          onSelect={() => {}}
          useNationalRank={false}
        />
      </div>
      {/* The map's own overlay stack is hidden here (it is sized for the
          full-width view), so its wording is restated at a size that fits. */}
      <div className="pipeline-map-notes">
        <span>ⓘ {MAP_CONTEXT_NOTE}</span>
        <span>{NOT_ASSESSED_LEGEND}</span>
      </div>

      <div className="pipeline-rank">
        <div className="pipeline-inset">
          <div className="pipeline-inset-head">{displayRegion(EXAMPLE_REGION)}</div>
          {/* The same nine cells step 2 explains, at the region's top-ranked
              area: the centre cell with its eight neighbours around it.

              The ceiling is lower than step 2's because the frame is far
              smaller. At 12.5 the 3 km block is 123% of this box's height, so
              it bleeds past every edge and the inset reads as a solid red
              rectangle; at 11 it sits at about two thirds, centred, with
              enough basemap around it to place it. */}
          <div className="pipeline-inset-map">
            <CellMap
              areas={neighbourhood}
              capacity={neighbourhood.length}
              revealed={false}
              onSelect={() => {}}
              useNationalRank={false}
              maxZoom={11}
            />
          </div>
        </div>

        <div className="pipeline-rank-detail">
          {/* A shared grid, so the two figures line up on one edge instead of
              flowing as sentences of different lengths. */}
          <dl className="pipeline-rank-figures">
            <dt>#{top.regional_rank}</dt>
            <dd>of {total.toLocaleString('en-NZ')} areas</dd>
            <dt>{(top.probability * 100).toFixed(1)}%</dt>
            <dd>estimated probability</dd>
          </dl>
          <div className="pipeline-rank-flag">Review this area first</div>

          <div className="pipeline-legend">
            <div className="pipeline-legend-ends">
              <span>Lower risk</span>
              <span>Higher risk</span>
            </div>
            <div className="scale pipeline-legend-bar" aria-hidden="true">
              <i /><i /><i /><i /><i />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function PipelineOverview({ year }: { year: number | undefined }) {
  return (
    <div className="pipeline">
      <div className="pipeline-grid">
        <Step number={1} title="Raw CAS data">
          <p className="pipeline-lede">
            The NZTA Crash Analysis System provides one record for every reported crash, including
            its location, year, severity, road conditions and environment.
          </p>
          <div className="pipeline-card">
            <div className="pipeline-source">
              <div className="pipeline-chip-mono">CAS</div>
              <div className="pipeline-source-label">
                Crash Analysis System
                <br />
                NZ Transport Agency Waka Kotahi
                <br />
                <a
                  className="pipeline-source-link"
                  href={CAS_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open data source ↗
                </a>
              </div>
            </div>

            <div className="pipeline-table" role="table" aria-label="Sample raw crash records">
              <div className="pipeline-table-row pipeline-table-head" role="row">
                {COLUMNS.map((column) => (
                  <span key={column} role="columnheader">{column}</span>
                ))}
              </div>
              <div className="pipeline-table-row pipeline-table-fade" role="row" aria-hidden="true">
                {COLUMNS.map((column) => <span key={column}>…</span>)}
              </div>
              {SAMPLE_ROWS.map((row, rowIndex) => (
                <div className="pipeline-table-row" role="row" key={rowIndex}>
                  {row.map((cell, index) => (
                    <span role="cell" key={`${rowIndex}-${COLUMNS[index]}`}>{cell}</span>
                  ))}
                </div>
              ))}
              <div className="pipeline-table-row pipeline-table-fade" role="row" aria-hidden="true">
                {COLUMNS.map((column) => <span key={column}>…</span>)}
              </div>
            </div>

            <div className="pipeline-strip">
              <strong>705,609</strong> crashes <span aria-hidden="true">·</span>{' '}
              <a
                className="pipeline-strip-link"
                href={CAS_FIELDS_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                <strong>72</strong> fields
              </a>{' '}
              <span aria-hidden="true">·</span> <strong>2006–2026</strong>
            </div>
          </div>
        </Step>

        <Step number={2} title="Build 1 km histories">
          <p className="pipeline-lede">
            Each crash is assigned to a 1 km square. For every target year, the model summarises
            crashes from the previous five years in that square and its eight neighbours.
          </p>
          <div className="pipeline-card">
            <NeighbourhoodMap year={year} />

            <div className="pipeline-years">
              {LOOKBACK_YEARS.map((yearLabel) => (
                <span className="pipeline-year" key={yearLabel}>{yearLabel}</span>
              ))}
              <span className="pipeline-arrow" aria-hidden="true">→</span>
              <span className="pipeline-year-predict">
                <small>Predict</small>
                2025
              </span>
            </div>

            <div className="pipeline-caption">One row per 1 km area and target year</div>
            <div className="pipeline-chip-warn">No data from the target year was used, to avoid data leakage.</div>
          </div>
        </Step>

        <Step number={3} title="Create features">
          <p className="pipeline-lede">
            Each history collapses into a fixed set of measures: counts, severity, speed,
            conditions, and the same measures for the eight neighbouring areas.
          </p>
          <div className="pipeline-card pipeline-card-flush">
            <div className="pipeline-card-head">Example 1 km area</div>
            <div className="pipeline-metrics">
              {FEATURE_ROWS.map(([label, value, width]) => (
                <div className="pipeline-metric" key={label}>
                  <div className="pipeline-metric-line">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                  <div className="pipeline-bar">
                    <div className="pipeline-bar-fill" style={{ width: `${width}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="pipeline-compress">
              <div className="pipeline-pills" aria-hidden="true">
                {Array.from({ length: 21 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
              <span className="pipeline-arrow" aria-hidden="true">→</span>
              <div className="pipeline-compressed" aria-hidden="true">
                <span className="is-filled" />
                <span />
                <span />
              </div>
            </div>
            <div className="pipeline-caption pipeline-caption-muted">
              Many raw crash rows become one clean feature row
            </div>
          </div>
        </Step>

        <Step number={4} title="Recommended model">
          <p className="pipeline-lede">
            A calibrated LightGBM model learns from past patterns and estimates the probability
            that each area will have a serious or fatal crash in the target year.
          </p>
          <div className="pipeline-card">
            <div className="pipeline-model-title">Calibrated LightGBM</div>
            <div className="pipeline-sunken">
              <TreeDiagram />
              <div className="pipeline-caption pipeline-caption-muted">
                Hundreds of shallow trees, summed into one score
              </div>
            </div>

            <ProbabilityScale />

            <div className="pipeline-model-notes">
              <h4 className="pipeline-notes-head">Model selection notes</h4>
              <div className="pipeline-model-copy">
                <p>
                  I went with a gradient-boosted tree model (LightGBM) to predict how many
                  severe crashes we should expect in each area. Instead of just asking &ldquo;will
                  a crash happen here, yes or no?&rdquo;, I set it up to predict counts using a
                  Poisson target. That&rsquo;s the standard method when you&rsquo;re interested in
                  &ldquo;how often does this event occur?&rdquo; rather than simply asking a
                  yes-or-no question.
                </p>
                <p>
                  Each area&rsquo;s prediction doesn&rsquo;t just look at itself in isolation. It
                  also checks out its eight closest neighbours. That way, the model gets some
                  local context. A cell that looks quiet but is surrounded by high-crash
                  neighbours gets flagged differently than one that&rsquo;s in a sea of low-risk
                  spots.
                </p>
                <p>
                  After the model spits out its raw scores, I run them through isotonic
                  calibration. This step basically rescales things so that if the model says
                  there&rsquo;s a 0.3 risk, about 30% of those areas actually see a severe crash.
                  Calibration doesn&rsquo;t really shuffle the rankings. But it does make the
                  numbers mean something real instead of just being &ldquo;higher is riskier.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </Step>

        <Step number={5} title="Rank areas for review">
          <p className="pipeline-lede">
            Areas are ranked from highest to lowest estimated risk, helping road-safety analysts
            decide where to focus their limited review capacity.
          </p>
          <div className="pipeline-card">
            <RegionalRankExample year={year} />

            <div className="pipeline-strip">
              The probability supports the ranking.
              <br />
              The ranking guides limited review capacity.
            </div>
          </div>
        </Step>
      </div>
    </div>
  )
}
