import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { AreaScore } from '../api/schemas'
import {
  BAND_COLOURS,
  cellCentroidCached,
  cellPolygonPathCached,
  percentileBand,
} from './cellGeometry'

export interface CellProperties {
  cell_id: string
  fillColor: string
  fillOpacity: number
}

/** Matches the design's .48 + p * .52 ramp. */
export function fillOpacityFor(probability: number): number {
  return 0.48 + probability * 0.52
}

/**
 * Bounding box of a set of cells, as MapLibre's [[west, south], [east, north]].
 *
 * A handful of eligible cells sit east of the 180th meridian and reproject to
 * negative longitudes, so a naive min/max spans the globe the long way round and
 * fits the camera to the whole world. Those are shifted past 180 instead, giving
 * a continuous NZ-centred range.
 */
export function cellBounds(
  cellIds: string[],
): [[number, number], [number, number]] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  const extend = (wrap: boolean) => {
    west = Infinity
    east = -Infinity
    for (const cellId of cellIds) {
      const centroid = cellCentroidCached(cellId)
      if (!centroid) continue
      const lng = wrap && centroid.lng < 0 ? centroid.lng + 360 : centroid.lng
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (centroid.lat < south) south = centroid.lat
      if (centroid.lat > north) north = centroid.lat
    }
  }

  extend(false)
  if (west === Infinity) return null
  if (east - west > 180) extend(true)

  return [
    [west, south],
    [east, north],
  ]
}

/**
 * One FeatureCollection for the whole population. MapLibre tessellates this once
 * per setData and renders it on the GPU, so unlike the Google overlay model there
 * is no per-cell instance cost and no need to cull to the viewport.
 *
 * Band colour is baked into the properties, so `useNationalRank` is part of the
 * identity of the result: switching ranking mode rebuilds the collection.
 */
export function buildCellCollection(
  areas: AreaScore[],
  useNationalRank: boolean,
): FeatureCollection<Polygon, CellProperties> {
  const features: Feature<Polygon, CellProperties>[] = []

  for (const area of areas) {
    const path = cellPolygonPathCached(area.cell_id)
    if (!path) continue

    // GeoJSON positions are [lng, lat] — the opposite order to the {lat, lng}
    // the geometry module returns — and the ring must be closed explicitly.
    // Google's Polygon closed paths for us; GeoJSON does not, and an unclosed
    // ring renders as a sliver rather than failing loudly.
    const ring: [number, number][] = path.map(({ lat, lng }) => [lng, lat])
    ring.push(ring[0])

    const percentile = useNationalRank ? area.national_percentile : area.regional_percentile

    features.push({
      type: 'Feature',
      // A top-level numeric id is what setFeatureState addresses a feature by.
      // Features without one are silently ignored, which would leave every cell
      // stuck at its unset reveal state and paint the map blank. Dense over the
      // emitted features, so a skipped cell id does not leave a hole.
      id: features.length,
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        cell_id: area.cell_id,
        fillColor: BAND_COLOURS[percentileBand(percentile)],
        fillOpacity: fillOpacityFor(area.probability),
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

/** Plain bounds, so this module needs no MapLibre import and stays unit-testable. */
export interface RevealBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface RevealStep {
  id: number
  /** Distance from the centre, normalised so the furthest visible cell is 1. */
  d: number
}

/**
 * Cells inside `bounds`, ordered by distance from its centre, for the load-in
 * wave. Cells outside are omitted: the caller reveals those immediately, which
 * keeps the wave the same length in every region rather than making a national
 * view animate for cells nobody can see.
 */
export function revealOrder(
  cells: { id: number; cellId: string }[],
  bounds: RevealBounds,
): RevealStep[] {
  // The same 180th-meridian shift cellBounds makes. A viewport that crosses the
  // meridian arrives with east numerically *below* west (166 .. -176), so that
  // ordering is the signal, not a wide span. Without the shift the range check
  // below rejects every cell, and a cell at -176 would sit ~350 degrees from a
  // centre at +174, collapsing every other cell's distance to nearly zero.
  const wrap = bounds.east < bounds.west
  const unwrap = (lng: number) => (wrap && lng < 0 ? lng + 360 : lng)

  const west = unwrap(bounds.west)
  const east = unwrap(bounds.east)
  const centreLng = (west + east) / 2
  const centreLat = (bounds.south + bounds.north) / 2

  // A degree of longitude is cos(lat) as wide as a degree of latitude, so
  // without this the wave is an ellipse stretched east-west rather than the
  // circle it looks like on screen.
  const lngScale = Math.cos((centreLat * Math.PI) / 180)

  const steps: RevealStep[] = []
  let max = 0

  for (const { id, cellId } of cells) {
    const centroid = cellCentroidCached(cellId)
    if (!centroid) continue
    const lng = unwrap(centroid.lng)
    if (lng < west || lng > east || centroid.lat < bounds.south || centroid.lat > bounds.north) {
      continue
    }
    const dx = (lng - centreLng) * lngScale
    const dy = centroid.lat - centreLat
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > max) max = d
    steps.push({ id, d })
  }

  // A single visible cell sits exactly at the centre, so max is 0. Dividing
  // would put NaN into the sort and into the animation cursor.
  if (max > 0) for (const step of steps) step.d /= max

  steps.sort((a, b) => a.d - b.d)
  return steps
}
