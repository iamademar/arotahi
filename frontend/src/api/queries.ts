import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getArea,
  getAreaHistory,
  getFeatures,
  getFullPopulation,
  getHealth,
  getModelCard,
  NotScoredError,
  type AreaQuery,
} from './client'

export const queryKeys = {
  health: ['health'] as const,
  population: (year: number, query: AreaQuery) => ['population', year, query] as const,
  area: (year: number, cellId: string) => ['area', year, cellId] as const,
  history: (cellId: string) => ['history', cellId] as const,
  features: (version: string) => ['features', version] as const,
  card: (version: string) => ['card', version] as const,
}

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth, staleTime: Infinity })
}

/**
 * The whole filtered population, in rank order. Cached indefinitely: the
 * backtests are locked, so for a given year and filter set the answer never
 * changes. The capacity slider re-slices this array rather than re-querying.
 *
 * placeholderData holds the previous selection's rows on screen while the next
 * one loads. Without it a new query key means data: undefined, so the ~700px
 * analysis section unmounts, the document collapses, and the browser clamps the
 * scroll to the top — losing the analyst's place and the focus on the select
 * they just used.
 *
 * The resolved scope is returned with the rows because the API's meta echoes
 * target_year and counts but not the region or filters it was asked for.
 * Stamping it here makes the invariant structural: whoever holds these rows
 * holds the scope that produced them, and keepPreviousData carries the two
 * together. Reading the scope from the live selection instead would print the
 * new region's name over the previous region's numbers.
 */
export function usePopulation(year: number | undefined, query: AreaQuery) {
  return useQuery({
    queryKey: queryKeys.population(year ?? 0, query),
    queryFn: async () => ({
      ...(await getFullPopulation(year as number, query)),
      query,
      year: year as number,
    }),
    enabled: year !== undefined,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  })
}

export function useArea(year: number | undefined, cellId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.area(year ?? 0, cellId ?? ''),
    queryFn: () => getArea(year as number, cellId as string),
    enabled: year !== undefined && !!cellId,
    // A not-scored cell is a valid answer, not a transient failure.
    retry: (count, error) => !(error instanceof NotScoredError) && count < 2,
    staleTime: Infinity,
  })
}

export function useAreaHistory(cellId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.history(cellId ?? ''),
    queryFn: () => getAreaHistory(cellId as string),
    enabled: !!cellId,
    staleTime: Infinity,
  })
}

export function useFeatures(modelVersion: string | undefined) {
  return useQuery({
    queryKey: queryKeys.features(modelVersion ?? ''),
    queryFn: () => getFeatures(modelVersion as string),
    enabled: !!modelVersion,
    staleTime: Infinity,
  })
}

export function useModelCard(modelVersion: string | undefined) {
  return useQuery({
    queryKey: queryKeys.card(modelVersion ?? ''),
    queryFn: () => getModelCard(modelVersion as string),
    enabled: !!modelVersion,
    staleTime: Infinity,
  })
}
