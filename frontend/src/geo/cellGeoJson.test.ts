import { describe, expect, it } from 'vitest'
import { buildCellCollection, cellBounds, fillOpacityFor, revealOrder } from './cellGeoJson'
import { BAND_COLOURS } from './cellGeometry'
import type { AreaScore } from '../api/schemas'

function area(overrides: Partial<AreaScore> = {}): AreaScore {
  return {
    cell_id: 'NZTM1K-1802-5814',
    target_year: 2025,
    probability: 0.5,
    national_rank: 1,
    national_percentile: 0.99,
    regional_rank: 1,
    regional_percentile: 0.1,
    region: 'Waikato Region',
    tla: 'Hamilton City',
    history_sufficiency: 'sufficient',
    prior_crash_count: 10,
    prior_severe_count: 1,
    actual_outcome: null,
    provenance: {
      model_version: 'cas-area-risk-1.0.0',
      grid_version: 'nztm-1km-origin0-v1',
      feature_schema_version: 'cas-area-features-1.0.0',
      source_snapshot_id: '967a34b12525',
    },
    ...overrides,
  }
}

describe('buildCellCollection geometry', () => {
  it('closes the ring', () => {
    const [feature] = buildCellCollection([area()], false).features
    const ring = feature.geometry.coordinates[0]
    // Four corners plus the repeated first corner. An unclosed ring renders as
    // a sliver rather than failing, so this is worth asserting directly.
    expect(ring).toHaveLength(5)
    expect(ring[4]).toEqual(ring[0])
  })

  it('emits [lng, lat] positions, not [lat, lng]', () => {
    const [feature] = buildCellCollection([area()], false).features
    const [lng, lat] = feature.geometry.coordinates[0][0]
    // Waikato: longitude ~175 east, latitude ~-37 south. Transposing these is
    // the easiest mistake to make and puts the map in the ocean.
    expect(lng).toBeGreaterThan(174)
    expect(lng).toBeLessThan(176)
    expect(lat).toBeLessThan(-36)
    expect(lat).toBeGreaterThan(-39)
  })

  it('skips a cell id it cannot parse rather than emitting a broken feature', () => {
    const collection = buildCellCollection([area({ cell_id: 'not-a-cell' }), area()], false)
    expect(collection.features).toHaveLength(1)
  })
})

describe('buildCellCollection styling', () => {
  it('bands by the ranking mode in force', () => {
    const subject = area({ national_percentile: 0.99, regional_percentile: 0.1 })

    const national = buildCellCollection([subject], true).features[0]
    expect(national.properties.fillColor).toBe(BAND_COLOURS[4])

    const regional = buildCellCollection([subject], false).features[0]
    expect(regional.properties.fillColor).toBe(BAND_COLOURS[0])
  })

  it('ramps opacity with probability', () => {
    expect(fillOpacityFor(0)).toBeCloseTo(0.48)
    expect(fillOpacityFor(1)).toBeCloseTo(1)
    const [feature] = buildCellCollection([area({ probability: 0.5 })], false).features
    expect(feature.properties.fillOpacity).toBeCloseTo(0.74)
  })

  it('carries the cell id through for click lookup', () => {
    const [feature] = buildCellCollection([area()], false).features
    expect(feature.properties.cell_id).toBe('NZTM1K-1802-5814')
  })
})

describe('cellBounds', () => {
  it('frames an ordinary region', () => {
    const bounds = cellBounds(['NZTM1K-1802-5814', 'NZTM1K-1810-5820'])
    expect(bounds).not.toBeNull()
    const [[west, south], [east, north]] = bounds!
    expect(west).toBeLessThan(east)
    expect(south).toBeLessThan(north)
    expect(west).toBeGreaterThan(170)
    expect(east).toBeLessThan(180)
  })

  it('keeps a national extent continuous across the 180th meridian', () => {
    // NZTM1K-2441-5091 sits east of 180 and reprojects to about -176.5, so a
    // naive min/max against a western cell spans the globe the long way round
    // and fits the camera to the whole world.
    const bounds = cellBounds(['NZTM1K-1178-4900', 'NZTM1K-2441-5091'])
    expect(bounds).not.toBeNull()
    const [[west], [east]] = bounds!
    expect(east - west).toBeLessThan(180)
    // The eastern edge is expressed past 180 rather than as a negative longitude.
    expect(east).toBeGreaterThan(180)
  })

  it('returns null when nothing can be placed', () => {
    expect(cellBounds([])).toBeNull()
    expect(cellBounds(['not-a-cell'])).toBeNull()
  })
})

describe('buildCellCollection feature ids', () => {
  it('gives every feature a unique numeric id for setFeatureState', () => {
    const collection = buildCellCollection(
      [area({ cell_id: 'NZTM1K-1802-5814' }), area({ cell_id: 'NZTM1K-1803-5814' })],
      false,
    )
    const ids = collection.features.map((f) => f.id)
    expect(ids).toEqual([0, 1])
    expect(ids.every((id) => typeof id === 'number')).toBe(true)
  })

  it('keeps ids dense when a cell id cannot be parsed', () => {
    // A hole here would address a feature that does not exist, and the reveal
    // for every later cell would silently target the wrong square.
    const collection = buildCellCollection(
      [area({ cell_id: 'not-a-cell' }), area({ cell_id: 'NZTM1K-1803-5814' })],
      false,
    )
    expect(collection.features.map((f) => f.id)).toEqual([0])
  })
})

describe('revealOrder', () => {
  // Real centroids for these Waikato cell ids:
  //   NZTM1K-1800-5730 -> 175.3009, -38.5513
  //   NZTM1K-1815-5745 -> 175.4682, -38.4128  (the middle one)
  //   NZTM1K-1830-5760 -> 175.6350, -38.2740
  // Bounds centred on the middle cell, so it is the nearest to the origin.
  const bounds = { west: 175.13, south: -38.69, east: 175.81, north: -38.14 }

  it('orders cells outward from the centre of the bounds', () => {
    const steps = revealOrder(
      [
        { id: 0, cellId: 'NZTM1K-1830-5760' },
        { id: 1, cellId: 'NZTM1K-1800-5730' },
        { id: 2, cellId: 'NZTM1K-1815-5745' },
      ],
      bounds,
    )
    const distances = steps.map((s) => s.d)
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  it('normalises so the furthest visible cell is exactly 1', () => {
    const steps = revealOrder(
      [
        { id: 0, cellId: 'NZTM1K-1815-5745' },
        { id: 1, cellId: 'NZTM1K-1800-5730' },
        { id: 2, cellId: 'NZTM1K-1830-5760' },
      ],
      bounds,
    )
    expect(steps.length).toBeGreaterThan(0)
    expect(Math.max(...steps.map((s) => s.d))).toBeCloseTo(1, 10)
    expect(steps.every((s) => s.d >= 0 && s.d <= 1)).toBe(true)
  })

  it('excludes cells outside the viewport', () => {
    // NZTM1K-1757-5920 is Auckland at -36.85, well north of these bounds.
    const steps = revealOrder(
      [
        { id: 0, cellId: 'NZTM1K-1815-5745' },
        { id: 1, cellId: 'NZTM1K-1757-5920' },
      ],
      bounds,
    )
    expect(steps.map((s) => s.id)).toEqual([0])
  })

  it('skips a cell id it cannot parse rather than emitting NaN', () => {
    const steps = revealOrder(
      [
        { id: 0, cellId: 'not-a-cell' },
        { id: 1, cellId: 'NZTM1K-1815-5745' },
      ],
      bounds,
    )
    expect(steps.map((s) => s.id)).toEqual([1])
    expect(steps.every((s) => Number.isFinite(s.d))).toBe(true)
  })

  it('does not divide by zero when one cell sits alone at the centre', () => {
    const steps = revealOrder([{ id: 0, cellId: 'NZTM1K-1815-5745' }], bounds)
    expect(steps).toHaveLength(1)
    expect(Number.isFinite(steps[0].d)).toBe(true)
  })

  it('returns an empty list for no cells', () => {
    expect(revealOrder([], bounds)).toEqual([])
  })

  it('keeps the wave spread out across the 180th meridian', () => {
    // Regression for the bug cellBounds already guards: without the wrap, the
    // eastern cell reads as ~350 degrees away and every other cell normalises
    // to nearly zero, so the whole map would flash in at once.
    const national = { west: 166.4, south: -47.3, east: -176.0, north: -34.4 }
    const steps = revealOrder(
      [
        { id: 0, cellId: 'NZTM1K-1815-5745' }, // Waikato   175.47, -38.41
        { id: 1, cellId: 'NZTM1K-1757-5920' }, // Auckland  174.77, -36.85
        { id: 2, cellId: 'NZTM1K-1230-4830' }, // Southland 168.18, -46.58
      ],
      national,
    )
    // All three are inside a national extent that crosses 180. Without the
    // wrap, west > east and every cell is rejected by the range check.
    expect(steps).toHaveLength(3)
    expect(Math.max(...steps.map((s) => s.d))).toBeCloseTo(1, 10)
    // Genuinely spread, not all crushed against zero by a ~350-degree maximum.
    expect(steps.some((s) => s.d > 0.1)).toBe(true)
  })
})
