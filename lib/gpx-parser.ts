/**
 * GPX file parsing utilities.
 *
 * Uses @tmcw/togeojson to convert GPX XML into GeoJSON, then extracts
 * route statistics (distance, elevation gain, start point).
 */

import { gpx } from '@tmcw/togeojson'
import { buildRouteRenderMetadata } from '@/lib/course-render-metadata'
import type { RouteGeoJSON, ElevationPoint } from '@/types/course'
import { haversineKm } from '@/lib/validation'
import type { RouteRenderMetadata } from '@/types/course'

export interface ParsedGpx {
  geojson: RouteGeoJSON
  startLat: number
  startLng: number
  distanceKm: number
  elevationGainM: number
  elevationProfile: ElevationPoint[]
  renderMetadata: RouteRenderMetadata | null
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Parse a GPX File into a RouteGeoJSON with route statistics.
 * Throws on invalid/empty GPX or files exceeding 10 MB.
 */
export async function parseGpxToGeoJSON(file: File): Promise<ParsedGpx> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('파일 크기가 10MB를 초과합니다.')
  }

  const text = await file.text()
  const doc = new DOMParser().parseFromString(text, 'text/xml')

  // Check for XML parse errors
  if (doc.querySelector('parsererror')) {
    throw new Error('유효한 GPX 파일이 아닙니다.')
  }

  const fc = gpx(doc)

  // Filter to LineString features only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineFeatures = (fc.features as any[]).filter(
    (f) => f.geometry?.type === 'LineString',
  )

  if (lineFeatures.length === 0) {
    throw new Error('경로 데이터가 없습니다. 유효한 트랙이 포함된 GPX 파일을 업로드해주세요.')
  }

  // Build RouteGeoJSON — coordinates may be 3D [lng, lat, ele]
  // We preserve elevation in the GeoJSON for downstream use (elevation chart etc.)
  const rawCoords: number[][] = []
  const routeFeatures: RouteGeoJSON['features'] = []

  for (const feature of lineFeatures) {
    const coords3d = feature.geometry.coordinates as number[][]
    rawCoords.push(...coords3d)
    routeFeatures.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords3d.map((c) =>
          c.length >= 3 && c[2] != null
            ? [c[0], c[1], c[2]] as [number, number, number]
            : [c[0], c[1]] as [number, number],
        ),
      },
    })
  }

  if (rawCoords.length === 0) {
    throw new Error('경로 데이터가 없습니다.')
  }

  const geojson: RouteGeoJSON = {
    type: 'FeatureCollection',
    features: routeFeatures,
  }

  const startLng = rawCoords[0][0]
  const startLat = rawCoords[0][1]

  const distanceKm = calculateDistanceKm(rawCoords)
  const elevationGainM = calculateElevationGain(rawCoords)
  const elevationProfile = buildElevationProfile(rawCoords)

  const renderMetadata = buildRouteRenderMetadata(geojson)

  return { geojson, startLat, startLng, distanceKm, elevationGainM, elevationProfile, renderMetadata }
}

/** Sum haversine distances between consecutive coordinates. */
function calculateDistanceKm(coords: number[][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
  }
  return Math.round(total * 10) / 10
}

/** Sum positive elevation deltas from 3D coordinates [lng, lat, ele].
 *  Applies a 5-point moving-average smoothing to suppress GPS noise, then
 *  sums positive deltas without a per-sample threshold. A per-sample
 *  threshold (e.g. ≥3 m) drops the sub-meter deltas from long gradual
 *  climbs recorded at 1Hz, which severely under-counts total gain on
 *  long courses like 설악그란폰도 (real ~3500 m vs filtered ~1369 m). */
function calculateElevationGain(coords: number[][]): number {
  const eles: number[] = []
  for (const c of coords) {
    const e = c[2]
    if (e != null && !Number.isNaN(e)) eles.push(e)
  }
  if (eles.length < 2) return 0

  // Apply 5-point moving-average smoothing only for realistic inputs.
  // For tiny inputs (<5 points) smoothing averages the whole signal away.
  let smoothed: number[]
  if (eles.length >= 5) {
    smoothed = new Array<number>(eles.length)
    for (let i = 0; i < eles.length; i++) {
      const lo = Math.max(0, i - 2)
      const hi = Math.min(eles.length - 1, i + 2)
      let sum = 0
      for (let j = lo; j <= hi; j++) sum += eles[j]
      smoothed[i] = sum / (hi - lo + 1)
    }
  } else {
    smoothed = eles
  }

  // Sum positive deltas on smoothed profile (no per-sample threshold)
  let gain = 0
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1]
    if (delta > 0) gain += delta
  }

  return Math.round(gain)
}

/** Build elevation profile: array of { distanceKm, elevationM } for each coordinate. */
function buildElevationProfile(coords: number[][]): ElevationPoint[] {
  // Only build profile if elevation data exists
  const hasElevation = coords.some((c) => c[2] != null)
  if (!hasElevation) return []

  const profile: ElevationPoint[] = []
  let cumulativeKm = 0

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      cumulativeKm += haversineKm(
        coords[i - 1][1], coords[i - 1][0],
        coords[i][1], coords[i][0],
      )
    }
    const ele = coords[i][2]
    if (ele != null) {
      profile.push({
        distanceKm: Math.round(cumulativeKm * 100) / 100,
        elevationM: Math.round(ele * 10) / 10,
      })
    }
  }

  return profile
}
