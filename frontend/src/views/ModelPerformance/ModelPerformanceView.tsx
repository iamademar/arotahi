import { useMemo, useState } from 'react'
import type { Health } from '../../api/schemas'
import { useFeatures, useModelCard } from '../../api/queries'
import { PipelineOverview } from './PipelineOverview'
import { TechnologiesUsed } from './TechnologiesUsed'
import { VersionMismatchBanner } from '../../components/Notices'
import { renderMarkdown } from '../../lib/markdown'
import { formatPercent } from '../../lib/backtestMetrics'
import metrics from '../../data/modelMetrics.json'

interface ModelPerformanceViewProps {
  modelVersion: string | undefined
  health: Health | undefined
  versionMismatch: boolean
}

type Pill = 'pipeline' | 'evaluation' | 'card' | 'features' | 'tech'

const PILLS: { id: Pill; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline overview' },
  { id: 'evaluation', label: 'Published evaluation' },
  { id: 'card', label: 'Model card' },
  { id: 'features', label: 'Feature dictionary' },
  { id: 'tech', label: 'Technologies used' },
]

function pct(value: number | null): string {
  return value === null ? '—' : formatPercent(value, 2)
}

export function ModelPerformanceView({
  modelVersion,
  health,
  versionMismatch,
}: ModelPerformanceViewProps) {
  const card = useModelCard(modelVersion)
  const features = useFeatures(modelVersion)
  const [featureSearch, setFeatureSearch] = useState('')
  const [pill, setPill] = useState<Pill>('pipeline')

  const cardHtml = useMemo(() => (card.data ? renderMarkdown(card.data) : ''), [card.data])

  const groupedFeatures = useMemo(() => {
    if (!features.data) return []
    const needle = featureSearch.trim().toLowerCase()
    const matching = needle
      ? features.data.features.filter(
          (feature) =>
            feature.name.toLowerCase().includes(needle) ||
            feature.group.toLowerCase().includes(needle),
        )
      : features.data.features

    const groups = new Map<string, typeof matching>()
    for (const feature of matching) {
      if (!groups.has(feature.group)) groups.set(feature.group, [])
      groups.get(feature.group)!.push(feature)
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [features.data, featureSearch])

  return (
    <main className="workspace">
      {versionMismatch && modelVersion && (
        <VersionMismatchBanner expected={metrics.model_version} actual={modelVersion} />
      )}
      <div className="pills" role="tablist" aria-label="Model documentation sections">
        {PILLS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`pill-${id}`}
            aria-selected={pill === id}
            aria-controls={`panel-${id}`}
            className="pill"
            onClick={() => setPill(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {pill === 'pipeline' && (
      <article className="panel" role="tabpanel" id="panel-pipeline" aria-labelledby="pill-pipeline">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Pipeline overview</h2>
              <p>From raw crash records to a ranked risk map.</p>
            </div>
            <span className="badge">Worked example</span>
          </div>
        </header>
        <PipelineOverview year={health ? Math.max(...health.years_available) : undefined} />
      </article>
      )}

      {pill === 'evaluation' && (
      <article className="panel" role="tabpanel" id="panel-evaluation" aria-labelledby="pill-evaluation">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Published evaluation</h2>
              <p>Locked test years, measured offline when the model was built.</p>
            </div>
            <span className="badge">Offline evaluation</span>
          </div>
        </header>
        <div className="panel-body">
          {/* These figures come from the artefacts, not from the served scores.
              The Prioritisation view computes its own metrics from the queue in
              front of the analyst, so the two can differ slightly where equal
              probabilities order differently. */}
          <p className="metrics-caption">
            These are offline figures transcribed from the modelling project when{' '}
            <code>{metrics.model_version}</code> was built. The Prioritisation view computes its
            own Recall@K, Precision@K and lift live from the queue you are looking at, so small
            differences between the two are expected where areas share the same estimated
            probability.
          </p>

          <table className="summary-table">
            <tbody>
              <tr>
                <th scope="row">Primary metric</th>
                <td>
                  {metrics.primary_metric.name}: <strong>{pct(metrics.primary_metric.value_2024)}</strong>{' '}
                  (2024), <strong>{pct(metrics.primary_metric.value_2025)}</strong> (2025)
                  <br />
                  <small style={{ color: 'var(--color-text-secondary)' }}>
                    {metrics.primary_metric.definition}
                  </small>
                </td>
              </tr>
              <tr>
                <th scope="row">Strongest baseline</th>
                <td>
                  <code>{metrics.strongest_baseline.name}</code>:{' '}
                  {pct(metrics.strongest_baseline.value_2024)} (2024),{' '}
                  {pct(metrics.strongest_baseline.value_2025)} (2025)
                </td>
              </tr>
              <tr>
                <th scope="row">Bootstrap difference</th>
                <td>
                  2024: <strong>+{metrics.bootstrap.diff_2024.toFixed(4)}</strong>, 95% interval{' '}
                  {metrics.bootstrap.ci_2024}
                  {metrics.bootstrap.excludes_zero_2024 ? ' (excludes zero)' : ''}
                  <br />
                  2025: <strong>+{metrics.bootstrap.diff_2025.toFixed(4)}</strong>, 95% interval{' '}
                  {metrics.bootstrap.ci_2025}
                  {metrics.bootstrap.excludes_zero_2025 ? ' (excludes zero)' : ''}
                  <br />
                  <small style={{ color: 'var(--color-text-secondary)' }}>{metrics.bootstrap.method}</small>
                </td>
              </tr>
              <tr>
                <th scope="row">Waikato guardrail</th>
                <td>
                  Recall@50 {pct(metrics.waikato_guardrail.recall_50_2024)} against a ceiling of{' '}
                  {pct(metrics.waikato_guardrail.ceiling_2024)} (2024); baseline{' '}
                  {pct(metrics.waikato_guardrail.baseline_recall_50_2024)}.{' '}
                  {metrics.waikato_guardrail.passed ? 'Met.' : 'Not met.'}
                  <br />
                  <small style={{ color: 'var(--color-text-secondary)' }}>
                    The ceiling is the best recall any ranking could reach at that capacity.
                  </small>
                </td>
              </tr>
              <tr>
                <th scope="row">PR-AUC</th>
                <td>
                  {metrics.pr_auc.value_2024?.toFixed(4)} (2024),{' '}
                  {metrics.pr_auc.value_2025?.toFixed(4)} (2025)
                </td>
              </tr>
              <tr>
                <th scope="row">Brier score</th>
                <td>
                  {metrics.brier.value_2024?.toFixed(4)} (2024),{' '}
                  {metrics.brier.value_2025?.toFixed(4)} (2025)
                  <br />
                  <small style={{ color: 'var(--color-text-secondary)' }}>{metrics.brier.calibration}</small>
                </td>
              </tr>
              <tr>
                <th scope="row">Refit schedule</th>
                <td>
                  {metrics.refit_schedule ?? 'Not specified in the published model artefacts.'}
                </td>
              </tr>
            </tbody>
          </table>

          <h3 className="subsection-heading">
            Eligible coverage by year
          </h3>
          <p className="metrics-caption">
            Coverage is the share of areas that recorded a serious or fatal crash that were in the
            eligible population at all. The remainder had no crash in the preceding five years, so
            they could not be scored — they are not assessed, not low risk.
          </p>
          <div className="table-wrap" style={{ maxHeight: 340 }}>
            <table className="summary-table">
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Eligible cells</th>
                  <th scope="col">Positive cells</th>
                  <th scope="col">Prevalence</th>
                  <th scope="col">Eligible coverage</th>
                  <th scope="col">Limited history</th>
                </tr>
              </thead>
              <tbody>
                {metrics.coverage_by_year.map((row) => (
                  <tr key={row.target_year}>
                    <td>{row.target_year}</td>
                    <td>{row.eligible_cells.toLocaleString('en-NZ')}</td>
                    <td>{row.positive_cells.toLocaleString('en-NZ')}</td>
                    <td>{pct(row.prevalence)}</td>
                    <td>{pct(row.eligible_coverage)}</td>
                    <td>{pct(row.low_history_share)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </article>
      )}

      {pill === 'card' && (
      <article className="panel" role="tabpanel" id="panel-card" aria-labelledby="pill-card">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Model card</h2>
              <p>Served by the prediction service for {modelVersion}.</p>
            </div>
          </div>
        </header>
        <div className="panel-body">
          {card.isLoading && <div className="loading">Loading model card…</div>}
          {card.error && <div className="error-state">{(card.error as Error).message}</div>}
          {card.data && (
            <div className="card-markdown" dangerouslySetInnerHTML={{ __html: cardHtml }} />
          )}
        </div>
      </article>
      )}

      {pill === 'features' && (
      <article className="panel" role="tabpanel" id="panel-features" aria-labelledby="pill-features">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Feature dictionary</h2>
              <p>
                {features.data
                  ? `${features.data.predictor_count} model inputs in ${Object.keys(features.data.groups).length} groups`
                  : 'Model inputs'}
              </p>
            </div>
          </div>
        </header>

        <label className="search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search model inputs</span>
          <input
            type="search"
            placeholder="Search model inputs"
            value={featureSearch}
            onChange={(event) => setFeatureSearch(event.target.value)}
          />
        </label>

        <div className="panel-body">
          {features.isLoading && <div className="loading">Loading model inputs…</div>}
          {features.error && <div className="error-state">{(features.error as Error).message}</div>}
          {groupedFeatures.map(([group, items]) => (
            <div className="feature-group" key={group}>
              <h3>
                {group} <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>({items.length})</span>
              </h3>
              <div className="feature-list">
                {items.map((feature) => (
                  <div className="feature-item" key={feature.name}>
                    <strong>{feature.name}</strong>
                    <small>
                      {feature.lookback_window} · {feature.dtype} · {feature.missing_rule}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {features.data && groupedFeatures.length === 0 && (
            <div className="empty-state">No model inputs match that search.</div>
          )}
        </div>
      </article>
      )}
      {pill === 'tech' && (
      <article className="panel" role="tabpanel" id="panel-tech" aria-labelledby="pill-tech">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Technologies used</h2>
              <p>The libraries and tools this project is built with.</p>
            </div>
            <span className="badge">Project stack</span>
          </div>
        </header>
        <TechnologiesUsed />
      </article>
      )}
    </main>
  )
}
