import { describe, expect, it } from 'vitest'
import {
  cellCentroid,
  cellNztmBounds,
  cellPolygonPath,
  parseCellId,
  percentileBand,
} from './cellGeometry'

describe('parseCellId', () => {
  it('extracts the grid indices', () => {
    expect(parseCellId('NZTM1K-1802-5814')).toEqual({ ix: 1802, iy: 5814 })
  })

  it('rejects anything that is not a 1 km cell id', () => {
    expect(parseCellId('not-a-cell')).toBeNull()
    expect(parseCellId('NZTM1K-1802')).toBeNull()
    expect(parseCellId('')).toBeNull()
  })
})

describe('cellNztmBounds', () => {
  it('yields the 1 km square implied by the identifier', () => {
    expect(cellNztmBounds('NZTM1K-1802-5814')).toEqual({
      minX: 1_802_000,
      minY: 5_814_000,
      maxX: 1_803_000,
      maxY: 5_815_000,
    })
  })
})

describe('cellCentroid', () => {
  it('reprojects the centroid into the Waikato', () => {
    const centroid = cellCentroid('NZTM1K-1802-5814')
    expect(centroid).not.toBeNull()
    // Verified independently against a Transverse Mercator inverse:
    // NZTM (1802500, 5814500) -> lat -37.79444, lon 175.29989.
    expect(centroid!.lat).toBeCloseTo(-37.7944, 3)
    expect(centroid!.lng).toBeCloseTo(175.2999, 3)
  })

  it('places a central Auckland cell in Auckland', () => {
    const centroid = cellCentroid('NZTM1K-1756-5919')
    expect(centroid!.lat).toBeCloseTo(-36.8575, 3)
    expect(centroid!.lng).toBeCloseTo(174.7556, 3)
  })

  it('falls inside New Zealand', () => {
    const centroid = cellCentroid('NZTM1K-1802-5814')!
    expect(centroid.lat).toBeGreaterThan(-47.5)
    expect(centroid.lat).toBeLessThan(-34)
    expect(centroid.lng).toBeGreaterThan(166)
    expect(centroid.lng).toBeLessThan(179)
  })
})

describe('cellPolygonPath', () => {
  it('returns four corners enclosing the centroid', () => {
    const path = cellPolygonPath('NZTM1K-1802-5814')!
    expect(path).toHaveLength(4)

    const centroid = cellCentroid('NZTM1K-1802-5814')!
    const lats = path.map((point) => point.lat)
    const lngs = path.map((point) => point.lng)
    expect(Math.min(...lats)).toBeLessThan(centroid.lat)
    expect(Math.max(...lats)).toBeGreaterThan(centroid.lat)
    expect(Math.min(...lngs)).toBeLessThan(centroid.lng)
    expect(Math.max(...lngs)).toBeGreaterThan(centroid.lng)
  })

  it('spans roughly one kilometre', () => {
    const path = cellPolygonPath('NZTM1K-1802-5814')!
    const latSpan = Math.max(...path.map((p) => p.lat)) - Math.min(...path.map((p) => p.lat))
    // 1 km of latitude is about 0.009 degrees.
    expect(latSpan).toBeGreaterThan(0.008)
    expect(latSpan).toBeLessThan(0.010)
  })
})

describe('percentileBand', () => {
  it('maps a 0-1 percentile onto five bands', () => {
    expect(percentileBand(0)).toBe(0)
    expect(percentileBand(0.19)).toBe(0)
    expect(percentileBand(0.35)).toBe(1)
    expect(percentileBand(0.5)).toBe(2)
    expect(percentileBand(0.75)).toBe(3)
    expect(percentileBand(0.99)).toBe(4)
    // The top percentile is 1.0 exactly and must not overflow the scale.
    expect(percentileBand(1)).toBe(4)
  })
})
