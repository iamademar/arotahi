import type { AreaScore } from '../api/schemas'

/**
 * Shortlists are held in localStorage. The prediction service implements none
 * of the shortlist endpoints from spec section 9, and there is no authentication
 * anywhere in the stack, so this is a single-analyst store on one machine.
 * See frontend/README.md for what this defers.
 */

/** The five analyst review statuses, in spec order (section 6.6). */
export const ANALYST_STATUSES = [
  'Not reviewed',
  'Desktop review',
  'Additional road data required',
  'Engineering review proposed',
  'Do not progress',
] as const

export type AnalystStatus = (typeof ANALYST_STATUSES)[number]

export interface ShortlistEntry {
  cell_id: string
  region: string
  tla: string
  /**
   * The score and model version as they stood when the analyst selected the
   * area. Never recomputed: the analyst's decision has to stay attributable to
   * what they actually saw, separate from any later model ranking.
   */
  score_at_selection: number
  regional_rank_at_selection: number
  model_version_at_selection: string
  analyst_status: AnalystStatus
  notes: string
  created_at: string
  updated_at: string
}

const PREFIX = 'cas-shortlist'

export function shortlistKey(targetYear: number, modelVersion: string): string {
  return `${PREFIX}:${targetYear}:${modelVersion}`
}

function safeRead(key: string): ShortlistEntry[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ShortlistEntry[]) : []
  } catch {
    return []
  }
}

function safeWrite(key: string, entries: ShortlistEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    // Storage unavailable (private mode, quota). The queue still works.
  }
}

export function readShortlist(targetYear: number, modelVersion: string): ShortlistEntry[] {
  return safeRead(shortlistKey(targetYear, modelVersion))
}

export function addToShortlist(
  targetYear: number,
  modelVersion: string,
  area: AreaScore,
): ShortlistEntry[] {
  const key = shortlistKey(targetYear, modelVersion)
  const entries = safeRead(key)
  if (entries.some((entry) => entry.cell_id === area.cell_id)) return entries

  const now = new Date().toISOString()
  const next: ShortlistEntry[] = [
    ...entries,
    {
      cell_id: area.cell_id,
      region: area.region,
      tla: area.tla,
      score_at_selection: area.probability,
      regional_rank_at_selection: area.regional_rank,
      model_version_at_selection: area.provenance.model_version,
      analyst_status: 'Not reviewed',
      notes: '',
      created_at: now,
      updated_at: now,
    },
  ]
  safeWrite(key, next)
  return next
}

export function removeFromShortlist(
  targetYear: number,
  modelVersion: string,
  cellId: string,
): ShortlistEntry[] {
  const key = shortlistKey(targetYear, modelVersion)
  const next = safeRead(key).filter((entry) => entry.cell_id !== cellId)
  safeWrite(key, next)
  return next
}

/**
 * Update only the analyst's own fields. `score_at_selection` and
 * `model_version_at_selection` are deliberately not updatable.
 */
export function updateShortlistEntry(
  targetYear: number,
  modelVersion: string,
  cellId: string,
  patch: Partial<Pick<ShortlistEntry, 'analyst_status' | 'notes'>>,
): ShortlistEntry[] {
  const key = shortlistKey(targetYear, modelVersion)
  const next = safeRead(key).map((entry) =>
    entry.cell_id === cellId
      ? { ...entry, ...patch, updated_at: new Date().toISOString() }
      : entry,
  )
  safeWrite(key, next)
  return next
}
