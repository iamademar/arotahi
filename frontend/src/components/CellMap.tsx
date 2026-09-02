import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
// MapLibre v6 derives its tile-parsing worker URL from its own import.meta.url,
// which does not survive Vite's dependency pre-bundling: the sibling worker
// module is never emitted, the request 404s, and the map paints blank with no
// console error. Handing Vite the worker explicitly lets it bundle and serve
// one, in dev and in the production build alike.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { AreaScore } from '../api/schemas'
import { cellCentroidCached } from '../geo/cellGeometry'
import { buildCellCollection, cellBounds, revealOrder } from '../geo/cellGeoJson'
import { LOOKBACK_LABEL, MAP_CONTEXT_NOTE, NOT_ASSESSED_LEGEND } from '../lib/copy'
import { REVEAL_DURATION_MS, REVEAL_FADE_MS } from '../lib/motion'

/**
 * OpenFreeMap's public instance: no API key, no billing, no signup. Positron is
 * the muted, label-light style, which keeps the yellow-to-red priority ramp
 * legible on top of it while retaining roads for orientation.
 */
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

/** Auckland, the default region. Only seen until fitBounds frames the data. */
const DEFAULT_CENTRE = { lat: -36.85, lng: 174.76 }
const DEFAULT_ZOOM = 9

/**
 * Floor for the initial fit. Below this a 1 km cell is under ~8 px and the
 * priority banding stops being readable; measured at 3.5 px when fitting all of
 * Auckland and 2.4 px for Waikato.
 */
const MIN_FIT_ZOOM = 9

/** Ceiling for the initial fit. Overridable per caller; see the fit below. */
const FIT_MAX_ZOOM = 12

/**
 * Gates a cell on its `reveal` feature-state for the load-in wave.
 *
 * coalesce is load-bearing twice over: an unset feature-state evaluates to
 * null, and ['*', x, null] is an evaluation error rather than a zero. It also
 * makes "not yet revealed" the default, so the wave has something to reveal.
 *
 * Multiplying by exactly 1 once revealed leaves the resting map bit-identical
 * to what it painted before the animation existed.
 */
const REVEAL_GATE: maplibregl.ExpressionSpecification = [
  'coalesce',
  ['feature-state', 'reveal'],
  0,
]

const SOURCE_ID = 'cells'
const FILL_LAYER = 'cells-fill'
const LINE_LAYER = 'cells-outline'
const SELECTED_LAYER = 'cells-selected'

interface CellMapProps {
  areas: AreaScore[]
  capacity: number
  revealed: boolean
  selectedCellId?: string
  onSelect: (area: AreaScore) => void
  useNationalRank: boolean
  /** Ceiling for the initial fit. Defaults to FIT_MAX_ZOOM; see the fit below. */
  maxZoom?: number
  /**
   * Show a hover popup with the cell's recent crash history. Off by default:
   * the Prioritisation map opens a full drawer on click, and a popup competing
   * with it would just cover the cells the analyst is scanning.
   */
  hoverInfo?: boolean
}

/**
 * Cell fills sit *below* the basemap's labels, so road and place names stay
 * readable through them — which is what MAP_CONTEXT_NOTE promises.
 */
/**
 * The hover popup is built as HTML, and its cell id and TLA come from the API,
 * so they are escaped rather than interpolated raw.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function firstSymbolLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
}

function Legend({ revealed, targetYear }: { revealed: boolean; targetYear: number }) {
  return (
    <aside className="legend">
      <div className="legend-title">Regional priority</div>
      <div className="scale" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="scale-labels">
        <span>Lower</span>
        <span>Top ranked</span>
      </div>
      {/* CSS rather than motion, like the markers below and for the same reason:
          this legend lives inside the map's overlay, and motion left the row
          pinned at its initial opacity there — it wrote the inline style and
          never ran the animation. An animated height:auto fared worse still,
          resolving "auto" as 0 and clipping the row away entirely. A keyframe
          owes nothing to React's tree and simply runs. */}
      {revealed && (
        <div className="legend-item legend-item-revealed">
          <span className="outcome-swatch" aria-hidden="true">
            {/* The glyph is its own element so the pop scales it without
                touching the swatch's 14px frame. */}
            <span className="outcome-swatch-glyph">▲</span>
          </span>
          <span>{targetYear} serious/fatal outcome</span>
        </div>
      )}
      <p className="legend-note">{NOT_ASSESSED_LEGEND}</p>
    </aside>
  )
}

export function CellMap({
  areas,
  capacity,
  revealed,
  selectedCellId,
  onSelect,
  useNationalRank,
  maxZoom,
  hoverInfo = false,
}: CellMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const frameRef = useRef<number | null>(null)
  const [styleReady, setStyleReady] = useState(false)
  // Drives the marker overlay's fade. Markers are DOM on their own effect, so
  // without this the rank badges hang over cells that have not arrived yet.
  const [revealing, setRevealing] = useState(false)

  const topRanked = useMemo(() => areas.slice(0, 5), [areas])
  const outcomes = useMemo(
    () => (revealed ? areas.slice(0, capacity).filter((a) => a.actual_outcome === 1) : []),
    [areas, capacity, revealed],
  )

  const collection = useMemo(
    () => buildCellCollection(areas, useNationalRank),
    [areas, useNationalRank],
  )

  // Held in refs so the delegated listeners and the markers do not have to be
  // torn down and rebuilt whenever the population or the callback identity moves.
  const byIdRef = useRef(new globalThis.Map<string, AreaScore>())
  useEffect(() => {
    const index = new globalThis.Map<string, AreaScore>()
    for (const area of areas) index.set(area.cell_id, area)
    byIdRef.current = index
  }, [areas])

  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Map instance.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [DEFAULT_CENTRE.lng, DEFAULT_CENTRE.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      // Google's configuration had no tilt or rotation; a tilted grid of 1 km
      // cells reads as broken rather than three-dimensional.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    // MapLibre rejects a malformed paint expression by firing an error event and
    // keeping the previous value, so without a listener the only symptom of a
    // broken reveal gate is cells that never appear, and no trace anywhere.
    map.on('error', (event) => {
      console.error('[CellMap]', event.error?.message ?? event)
    })

    // 'load' fires once. An effect that subscribes after it has already fired
    // would wait forever, so check the current state first.
    const ready = () => setStyleReady(true)
    if (map.isStyleLoaded()) ready()
    else map.once('load', ready)

    return () => {
      setStyleReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Source and layers. setData on subsequent changes keeps region switching smooth.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady) return

    const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (existing) {
      existing.setData(collection)
      return
    }

    map.addSource(SOURCE_ID, { type: 'geojson', data: collection })
    const before = firstSymbolLayerId(map)

    map.addLayer(
      {
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': ['*', ['get', 'fillOpacity'], REVEAL_GATE],
          // Set here rather than after the fact: a transition applied later
          // would let the first cells the wave reaches snap instead of fade.
          'fill-opacity-transition': { duration: REVEAL_FADE_MS, delay: 0 },
        },
      },
      before,
    )
    map.addLayer(
      {
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#ffffff',
          'line-opacity': ['*', 0.9, REVEAL_GATE],
          'line-opacity-transition': { duration: REVEAL_FADE_MS, delay: 0 },
          'line-width': 0.5,
        },
      },
      before,
    )
    // Selection is its own layer above the outlines rather than a restyle of one
    // feature: MapLibre draws by layer order, so a thicker ring inside the
    // outline layer would still be overdrawn by its neighbours.
    map.addLayer(
      {
        id: SELECTED_LAYER,
        type: 'line',
        source: SOURCE_ID,
        filter: ['==', ['get', 'cell_id'], ''],
        paint: { 'line-color': '#004771', 'line-opacity': 1, 'line-width': 3 },
      },
      before,
    )
  }, [collection, styleReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady || !map.getLayer(SELECTED_LAYER)) return
    // '' rather than null: setFilter(id, null) would select every cell.
    map.setFilter(SELECTED_LAYER, ['==', ['get', 'cell_id'], selectedCellId ?? ''])
  }, [selectedCellId, styleReady])

  // One delegated listener replaces one listener per cell.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady) return

    const handleClick = (event: maplibregl.MapLayerMouseEvent) => {
      const cellId = event.features?.[0]?.properties?.cell_id as string | undefined
      if (!cellId) return
      const area = byIdRef.current.get(cellId)
      if (area) onSelectRef.current(area)
    }
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }

    map.on('click', FILL_LAYER, handleClick)
    map.on('mouseenter', FILL_LAYER, enter)
    map.on('mouseleave', FILL_LAYER, leave)
    return () => {
      map.off('click', FILL_LAYER, handleClick)
      map.off('mouseenter', FILL_LAYER, enter)
      map.off('mouseleave', FILL_LAYER, leave)
    }
  }, [styleReady])

  /**
   * Hover popup: the hovered cell's own crash history, which is what the
   * pipeline's step 2 is explaining. Opt-in via hoverInfo.
   *
   * closeOnClick is off because the click belongs to onSelect, and the popup
   * follows the pointer rather than pinning to a centroid: at close zoom a
   * centroid-anchored popup sits far from the cursor on a 1 km cell.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady || !hoverInfo) return

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'cell-hover-popup',
    })

    const move = (event: maplibregl.MapLayerMouseEvent) => {
      const cellId = event.features?.[0]?.properties?.cell_id as string | undefined
      const area = cellId ? byIdRef.current.get(cellId) : undefined
      if (!area) {
        popup.remove()
        return
      }
      const lookback = LOOKBACK_LABEL(area.target_year)
      const crashes = area.prior_crash_count
      const severe = area.prior_severe_count
      popup
        .setLngLat(event.lngLat)
        .setHTML(
          `<div class="cell-hover-id">${escapeHtml(area.cell_id)}</div>` +
            `<div class="cell-hover-place">${escapeHtml(area.tla)}</div>` +
            `<dl class="cell-hover-stats">` +
            `<dt>${crashes === 1 ? 'crash' : 'crashes'} ${lookback}</dt><dd>${crashes}</dd>` +
            `<dt>serious or fatal</dt><dd>${severe}</dd>` +
            `</dl>`,
        )
        .addTo(map)
    }
    const hide = () => popup.remove()

    map.on('mousemove', FILL_LAYER, move)
    map.on('mouseleave', FILL_LAYER, hide)
    return () => {
      map.off('mousemove', FILL_LAYER, move)
      map.off('mouseleave', FILL_LAYER, hide)
      popup.remove()
    }
  }, [styleReady, hoverInfo])

  // Markers stay real DOM so they keep their title, focusability and CSS.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const add = (area: AreaScore, element: HTMLElement, offset: [number, number]) => {
      const centroid = cellCentroidCached(area.cell_id)
      if (!centroid) return
      element.addEventListener('click', (event) => {
        // Markers sit in an overlay above the canvas, so without this the click
        // also reaches the fill layer underneath and selects twice.
        event.stopPropagation()
        onSelectRef.current(area)
      })
      markersRef.current.push(
        new maplibregl.Marker({ element, anchor: 'center', offset })
          .setLngLat([centroid.lng, centroid.lat])
          .addTo(map),
      )
    }

    topRanked.forEach((area, index) => {
      const element = document.createElement('div')
      element.className = 'map-marker-rank'
      element.textContent = String(index + 1)
      element.title = `Rank ${index + 1}: ${area.tla}`
      add(area, element, [0, 0])
    })

    outcomes.forEach((area) => {
      const element = document.createElement('div')
      element.className = 'map-marker-outcome'
      // The glyph is wrapped rather than set as text: MapLibre writes its own
      // transform on the marker element every frame to position it, so the pop
      // keyframe has to scale a child or the marker would jump to the origin.
      const glyph = document.createElement('span')
      glyph.className = 'map-marker-outcome-glyph'
      glyph.textContent = '▲'
      element.append(glyph)
      element.title = `${area.target_year} serious or fatal crash recorded`
      // A pixel offset holds its distance from the rank badge at every zoom,
      // which a fixed offset in degrees does not.
      add(area, element, [16, -16])
    })

    return () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
  }, [topRanked, outcomes])

  /**
   * Frame the review queue rather than the whole population. Fitting every
   * eligible cell draws them at about 3 px across, too small to read the
   * priority banding or click; the queue clusters far tighter, so the same
   * cells land around 13 px. The rest still renders, just outside the initial
   * view.
   */
  const signature = areas.length > 0 ? `${areas[0].cell_id}:${areas.length}` : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map || areas.length === 0) return

    // areas arrives in rank order, so the head of the list is the queue.
    const framed = areas.slice(0, capacity).map((area) => area.cell_id)
    const bounds = cellBounds(framed)
    if (!bounds) return

    // maxZoom matters: a queue concentrated in a few cells would otherwise fit
    // to street level and lose all surrounding context. The fit is kept for the
    // zoom it picks; the centre it implies is replaced below.
    //
    // A caller framing a deliberately small area passes a higher ceiling: the
    // pipeline's nine-cell worked example spans 3 km, which the default caps at
    // ~200 px in its frame — under half the width, adrift in basemap.
    // Padding scales with the container. A flat 40px is a comfortable margin on
    // the full-width map but eats over 40% of a 190px inset, holding the fit two
    // zoom levels below the ceiling it was given.
    const padding = Math.min(40, Math.round(Math.min(map.getCanvas().clientWidth, map.getCanvas().clientHeight) * 0.08))
    map.fitBounds(bounds, { padding, duration: 0, maxZoom: maxZoom ?? FIT_MAX_ZOOM })

    // Centre on the top-ranked cell rather than the midpoint of the queue's
    // bounding box. The midpoint is not a place: for a queue spread across a
    // region it lands somewhere with no cells on it at all — nationally it fell
    // in Cook Strait, with none of the top 50 on screen. Rank 1 is always a real
    // cell, and the most important one, so it also gives the reveal wave a
    // meaningful origin to bloom from.
    //
    // MIN_FIT_ZOOM still holds the floor: some regions have a queue spread right
    // across them (Waikato's top 50 spans 1.5°) and the fit alone leaves 2 px
    // cells. Fewer ranked areas are in frame at once, but the ones on screen are
    // legible and panning reaches the rest.
    const rank1 = cellCentroidCached(areas[0].cell_id)
    if (rank1) {
      map.jumpTo({
        zoom: Math.max(map.getZoom(), MIN_FIT_ZOOM),
        center: [rank1.lng, rank1.lat],
      })
    }
  }, [signature, capacity, maxZoom, styleReady]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The load-in wave: cells appear from the centre of the view outward, speeding
   * up as it spreads.
   *
   * Driven by feature-state, never by setPaintProperty. A paint property holding
   * a data-driven expression reports itself as changed on every set, which makes
   * MapLibre mark the source "reload" and re-tessellate all ~21k polygons — per
   * frame. setFeatureState patches paint attributes for the named feature only.
   *
   * Each cell is set once, at the moment the wave reaches it; the fade from
   * there is fill-opacity-transition on the GPU, so no JS drives it.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReady || !map.getLayer(FILL_LAYER) || areas.length === 0) return

    const reveal = (id: number) => map.setFeatureState({ source: SOURCE_ID, id }, { reveal: 1 })

    // Read inside the effect, not at module scope, so toggling the OS setting is
    // picked up on the next region change. MotionConfig does not reach MapLibre.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    // Cleared here rather than in the cleanup: clearing on the way out would
    // blank the map for a frame between regions.
    map.removeFeatureState({ source: SOURCE_ID })

    const cells = areas.map((area, id) => ({ id, cellId: area.cell_id }))

    if (reduced) {
      for (const { id } of cells) reveal(id)
      setRevealing(false)
      return
    }

    setRevealing(true)

    const bounds = map.getBounds()
    const steps = revealOrder(cells, {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    })

    // Everything off-screen is simply present. That keeps the wave the same
    // length in every region instead of making a national view animate cells
    // nobody can see.
    const animating = new Set(steps.map((step) => step.id))
    for (const { id } of cells) if (!animating.has(id)) reveal(id)

    let cursor = 0
    const start = performance.now()

    const frame = (now: number) => {
      // The map can be torn down mid-wave; its own cleanup nulls the ref.
      if (!mapRef.current || !map.getLayer(FILL_LAYER)) return

      const t = Math.min(1, (now - start) / REVEAL_DURATION_MS)
      // Quadratic ease-in: the front starts slow and accelerates outward, which
      // is the effect asked for. Cubic holds too long and reads as a stall.
      const radius = t * t

      while (cursor < steps.length && steps[cursor].d <= radius) {
        reveal(steps[cursor].id)
        cursor += 1
      }

      if (t < 1) {
        frameRef.current = requestAnimationFrame(frame)
      } else {
        // The partition above is made against map.getBounds() at effect time,
        // which the initial fit may not have settled yet. In a small frame that
        // leaves cells classified as on-screen but never reached by the radius,
        // and a cell at reveal 0 is invisible, not merely un-animated. Ending
        // the wave by revealing everything makes the resting state independent
        // of when the camera moved.
        for (const { id } of cells) reveal(id)
        setRevealing(false)
      }
    }
    frameRef.current = requestAnimationFrame(frame)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    // Keyed on signature, deliberately without capacity: the wave belongs to a
    // change of population, not to the queue-size slider.
  }, [signature, styleReady]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`map${revealing ? ' revealing' : ''}`}>
      <div className="map-canvas" ref={containerRef} />
      <div className="map-overlays">
        <p className="context-note">ⓘ {MAP_CONTEXT_NOTE}</p>
        <Legend revealed={revealed} targetYear={areas[0]?.target_year ?? 0} />
      </div>
    </div>
  )
}
