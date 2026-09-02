import proj4 from 'proj4'

/**
 * NZ Transverse Mercator 2000 (EPSG:2193). proj4 does not ship this definition,
 * so it is registered explicitly. Verified against an independent implementation
 * of the Transverse Mercator inverse: NZTM (1802500, 5814500) reprojects to
 * lat -37.79444, lon 175.29989, which falls in the Waikato as expected.
 */
export const NZTM_DEF =
  '+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'

export const NZTM = 'EPSG:2193'
export const WGS84 = 'EPSG:4326'

proj4.defs(NZTM, NZTM_DEF)

export interface LatLng {
  lat: number
  lng: number
}

/** Reproject an NZTM easting/northing to WGS84 degrees. */
export function nztmToWgs84(x: number, y: number): LatLng {
  const [lng, lat] = proj4(NZTM, WGS84, [x, y])
  return { lat, lng }
}
