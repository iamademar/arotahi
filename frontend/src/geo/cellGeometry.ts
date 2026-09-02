import { nztmToWgs84, type LatLng } from './nztm'

/**
 * Cell geometry is derived from the identifier: the API serves no geometry.
 * `NZTM1K-{ix}-{iy}` encodes ix = floor(X / 1000), iy = floor(Y / 1000) in
 * NZTM, with the grid origin at (0, 0). The cell is therefore the 1 km square
 * from (ix*1000, iy*1000) to (ix*1000 + 1000, iy*1000 + 1000).
 */
export const CELL_SIZE_M = 1000

const CELL_ID_PATTERN = /^NZTM1K-(-?\d+)-(-?\d+)$/

export interface CellIndices {
  ix: number
  iy: number
}

export interface NztmBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function parseCellId(cellId: string): CellIndices | null {
  const match = CELL_ID_PATTERN.exec(cellId.trim())
  if (!match) return null
  return { ix: Number(match[1]), iy: Number(match[2]) }
}

export function cellNztmBounds(cellId: string): NztmBounds | null {
  const parsed = parseCellId(cellId)
  if (!parsed) return null
  const minX = parsed.ix * CELL_SIZE_M
  const minY = parsed.iy * CELL_SIZE_M
  return { minX, minY, maxX: minX + CELL_SIZE_M, maxY: minY + CELL_SIZE_M }
}

/** Centroid in WGS84, used for markers and for fitting bounds. */
export function cellCentroid(cellId: string): LatLng | null {
  const bounds = cellNztmBounds(cellId)
  if (!bounds) return null
  return nztmToWgs84(bounds.minX + CELL_SIZE_M / 2, bounds.minY + CELL_SIZE_M / 2)
}

/**
 * The four corners, anticlockwise from the south-west. Open: the caller closes
 * the ring if its consumer needs it (GeoJSON does; see cellGeoJson.ts).
 * Reprojected individually: a 1 km square in NZTM is not exactly a rectangle in
 * WGS84, and using a lat/lng bounding box would misplace the edges.
 */
export function cellPolygonPath(cellId: string): LatLng[] | null {
  const bounds = cellNztmBounds(cellId)
  if (!bounds) return null
  return [
    nztmToWgs84(bounds.minX, bounds.minY),
    nztmToWgs84(bounds.maxX, bounds.minY),
    nztmToWgs84(bounds.maxX, bounds.maxY),
    nztmToWgs84(bounds.minX, bounds.maxY),
  ]
}

const pathCache = new Map<string, LatLng[]>()

/** Memoised: a national population is ~21,400 cells and gets re-rendered often. */
export function cellPolygonPathCached(cellId: string): LatLng[] | null {
  const cached = pathCache.get(cellId)
  if (cached) return cached
  const path = cellPolygonPath(cellId)
  if (path) pathCache.set(cellId, path)
  return path
}

const centroidCache = new Map<string, LatLng>()

export function cellCentroidCached(cellId: string): LatLng | null {
  const cached = centroidCache.get(cellId)
  if (cached) return cached
  const centroid = cellCentroid(cellId)
  if (centroid) centroidCache.set(cellId, centroid)
  return centroid
}

/** Five priority bands from a 0-1 percentile; band 4 is the top. */
export function percentileBand(percentile: number): 0 | 1 | 2 | 3 | 4 {
  const band = Math.floor(percentile * 5)
  return Math.min(4, Math.max(0, band)) as 0 | 1 | 2 | 3 | 4
}

export const BAND_COLOURS = ['#fbe9e7', '#f3b9b2', '#e58074', '#cf4b3c', '#b3251e'] as const

/** Text label for each band: the map must never encode by colour alone. */
export const BAND_LABELS = [
  'Lower priority',
  'Lower-middle priority',
  'Middle priority',
  'Upper-middle priority',
  'Top ranked',
] as const
