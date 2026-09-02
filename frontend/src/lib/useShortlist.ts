import { useCallback, useEffect, useState } from 'react'
import type { AreaScore } from '../api/schemas'
import {
  addToShortlist,
  readShortlist,
  removeFromShortlist,
  updateShortlistEntry,
  type AnalystStatus,
  type ShortlistEntry,
} from './shortlistStore'

/** React binding over the localStorage shortlist for one run. */
export function useShortlist(targetYear: number | undefined, modelVersion: string | undefined) {
  const ready = targetYear !== undefined && !!modelVersion
  const [entries, setEntries] = useState<ShortlistEntry[]>([])

  useEffect(() => {
    setEntries(ready ? readShortlist(targetYear, modelVersion) : [])
  }, [ready, targetYear, modelVersion])

  const add = useCallback(
    (area: AreaScore) => {
      if (!ready) return
      setEntries(addToShortlist(targetYear, modelVersion, area))
    },
    [ready, targetYear, modelVersion],
  )

  const remove = useCallback(
    (cellId: string) => {
      if (!ready) return
      setEntries(removeFromShortlist(targetYear, modelVersion, cellId))
    },
    [ready, targetYear, modelVersion],
  )

  const update = useCallback(
    (cellId: string, patch: { analyst_status?: AnalystStatus; notes?: string }) => {
      if (!ready) return
      setEntries(updateShortlistEntry(targetYear, modelVersion, cellId, patch))
    },
    [ready, targetYear, modelVersion],
  )

  const toggle = useCallback(
    (area: AreaScore) => {
      if (entries.some((entry) => entry.cell_id === area.cell_id)) remove(area.cell_id)
      else add(area)
    },
    [entries, add, remove],
  )

  const has = useCallback(
    (cellId: string) => entries.some((entry) => entry.cell_id === cellId),
    [entries],
  )

  return { entries, add, remove, update, toggle, has }
}
