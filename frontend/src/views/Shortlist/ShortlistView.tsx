import type { RunState } from '../../App'
import { buildShortlistCsv, downloadCsv, type ExportContext } from '../../lib/exportBrief'
import { displayRegion } from '../../lib/copy'
import type { useShortlist } from '../../lib/useShortlist'

interface ShortlistViewProps {
  run: RunState
  shortlist: ReturnType<typeof useShortlist>
  modelVersion: string | undefined
}

export function ShortlistView({ run, shortlist, modelVersion }: ShortlistViewProps) {
  const { entries, remove } = shortlist

  function handleExport() {
    const context: ExportContext = { targetYear: run.year ?? 0 }
    downloadCsv(
      `crash-area-shortlist-${run.year}.csv`,
      buildShortlistCsv(entries, context, undefined),
    )
  }

  return (
    <main className="workspace">
      <section className="heading">
        <div>
          <div className="eyebrow">
            {run.year} {run.region ? displayRegion(run.region) : 'New Zealand'} shortlist
          </div>
          <h1>Areas you have selected</h1>
          <p className="view-intro">
            Each entry keeps the estimated probability and model version as they stood when it was
            selected, so the analyst decision stays separate from any later ranking.
          </p>
        </div>
      </section>

      <article className="panel">
        <header className="panel-header">
          <div className="panel-title">
            <div>
              <h2>Shortlist</h2>
              <p>
                Stored in this browser for {run.year} · {modelVersion ?? 'unknown model'}
              </p>
            </div>
            <span className="badge green">{entries.length}</span>
          </div>
          <div className="panel-actions">
            <button
              type="button"
              className="button"
              onClick={handleExport}
              disabled={entries.length === 0}
            >
              ⇩ Export CSV
            </button>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="empty-state">
            No areas shortlisted for this run yet. Add one from the review queue.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">Score at selection</th>
                  <th scope="col">Added</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.cell_id}>
                    <td>
                      <strong>{entry.tla}</strong>
                      <br />
                      <small className="cell-id">
                        {entry.cell_id}
                      </small>
                    </td>
                    <td>
                      <span className="probability-value">
                        {(entry.score_at_selection * 100).toFixed(1)}%
                      </span>
                      <br />
                      <small className="meta-note">
                        rank #{entry.regional_rank_at_selection}
                      </small>
                    </td>
                    <td>
                      <small className="meta-note">
                        {new Date(entry.created_at).toLocaleDateString('en-NZ')}
                      </small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="button icon"
                          title="Remove from shortlist"
                          onClick={() => remove(entry.cell_id)}
                        >
                          ×<span className="sr-only">Remove {entry.cell_id}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </main>
  )
}
