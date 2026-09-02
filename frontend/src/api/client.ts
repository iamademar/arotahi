import {
  areaHistorySchema,
  areaListSchema,
  areaScoreSchema,
  errorBodySchema,
  featuresResponseSchema,
  healthSchema,
  notScoredSchema,
  type AreaHistory,
  type AreaList,
  type AreaScore,
  type FeaturesResponse,
  type Health,
} from './schemas'

/** A cell outside the eligible population. Carries the API's own wording. */
export class NotScoredError extends Error {
  readonly cellId: string
  readonly targetYear: number
  readonly reason: string
  constructor(cellId: string, targetYear: number, reason: string) {
    super(reason)
    this.name = 'NotScoredError'
    this.cellId = cellId
    this.targetYear = targetYear
    this.reason = reason
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Turn a non-2xx response into the most specific error we can describe. */
async function toError(response: Response): Promise<never> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`)
  }

  const parsed = errorBodySchema.safeParse(body)
  if (parsed.success) {
    const { detail } = parsed.data
    const notScored = notScoredSchema.safeParse(detail)
    if (notScored.success) {
      throw new NotScoredError(
        notScored.data.cell_id,
        notScored.data.target_year,
        notScored.data.reason,
      )
    }
    if (typeof detail === 'string') throw new ApiError(response.status, detail)
    if (Array.isArray(detail)) {
      throw new ApiError(response.status, detail.map((d) => d.msg).join('; '))
    }
  }
  throw new ApiError(response.status, `${response.status} ${response.statusText}`)
}

async function request<T>(path: string, parse: (data: unknown) => T): Promise<T> {
  const response = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!response.ok) await toError(response)
  return parse(await response.json())
}

export function getHealth(): Promise<Health> {
  return request('/api/health', (d) => healthSchema.parse(d))
}

export interface AreaQuery {
  region?: string
  tla?: string
  historySufficiency?: 'low' | 'sufficient'
  minPriorCrashes?: number
  limit?: number
  offset?: number
}

function areaSearchParams(query: AreaQuery): URLSearchParams {
  const params = new URLSearchParams()
  // Region and TLA are matched exactly by the API, so the full string
  // ("Waikato Region", "Ōtorohanga District") is sent, macrons and all.
  if (query.region) params.set('region', query.region)
  if (query.tla) params.set('tla', query.tla)
  if (query.historySufficiency) params.set('history_sufficiency', query.historySufficiency)
  if (query.minPriorCrashes) params.set('min_prior_crashes', String(query.minPriorCrashes))
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  if (query.offset !== undefined) params.set('offset', String(query.offset))
  return params
}

export function getAreas(year: number, query: AreaQuery = {}): Promise<AreaList> {
  const params = areaSearchParams(query)
  return request(`/api/runs/${year}/areas?${params}`, (d) => areaListSchema.parse(d))
}

/** The API caps `limit` at 1000, so a whole population is fetched in pages. */
export const PAGE_SIZE = 1000

/**
 * Fetch every row matching the filters, in rank order. Waikato is ~3,700 rows
 * (4 requests); all of New Zealand is ~21,400 (22 requests). Measured at about
 * 30 ms per page locally, so this is cheap enough to do once per filter change
 * and cache indefinitely.
 */
export async function getFullPopulation(
  year: number,
  query: AreaQuery = {},
): Promise<{ meta: AreaList['meta']; areas: AreaScore[] }> {
  const first = await getAreas(year, { ...query, limit: PAGE_SIZE, offset: 0 })
  const areas = [...first.areas]
  const total = first.meta.total_matching

  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) {
    const page = await getAreas(year, { ...query, limit: PAGE_SIZE, offset })
    areas.push(...page.areas)
    if (page.areas.length === 0) break
  }
  return { meta: first.meta, areas }
}

export function getArea(year: number, cellId: string): Promise<AreaScore> {
  return request(`/api/runs/${year}/areas/${encodeURIComponent(cellId)}`, (d) =>
    areaScoreSchema.parse(d),
  )
}

export function getAreaHistory(cellId: string): Promise<AreaHistory> {
  return request(`/api/areas/${encodeURIComponent(cellId)}/history`, (d) =>
    areaHistorySchema.parse(d),
  )
}

export function getFeatures(modelVersion: string): Promise<FeaturesResponse> {
  return request(`/api/models/${encodeURIComponent(modelVersion)}/features`, (d) =>
    featuresResponseSchema.parse(d),
  )
}

/** The model card is served as text/plain markdown. */
export async function getModelCard(modelVersion: string): Promise<string> {
  const response = await fetch(`/api/models/${encodeURIComponent(modelVersion)}/card`)
  if (!response.ok) await toError(response)
  return response.text()
}
