import type { ShortlistEntry } from './shortlistStore'
import type { AreaScore } from '../api/schemas'

/**
 * Shared context for the shortlist export. The queue CSV and the printable
 * brief that also consumed this were removed along with the topbar's Export
 * brief button, so only the fields the shortlist rows actually need remain.
 */
export interface ExportContext {
  targetYear: number
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildShortlistCsv(
  entries: ShortlistEntry[],
  context: ExportContext,
  provenance: AreaScore['provenance'] | undefined,
): string {
  const header = [
    'cell_id',
    'region',
    'tla',
    'score_at_selection',
    'regional_rank_at_selection',
    'model_version_at_selection',
    'analyst_status',
    'notes',
    'created_at',
    'updated_at',
    'target_year',
    'grid_version',
    'feature_schema_version',
    'source_snapshot_id',
  ]
  const lines = [header.join(',')]
  for (const entry of entries) {
    lines.push(
      [
        entry.cell_id,
        entry.region,
        entry.tla,
        entry.score_at_selection,
        entry.regional_rank_at_selection,
        entry.model_version_at_selection,
        entry.analyst_status,
        entry.notes,
        entry.created_at,
        entry.updated_at,
        context.targetYear,
        provenance?.grid_version ?? '',
        provenance?.feature_schema_version ?? '',
        provenance?.source_snapshot_id ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
