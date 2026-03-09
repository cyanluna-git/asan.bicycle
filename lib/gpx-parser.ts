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

/** Sum positive elevation deltas from 3D coordinates [lng, lat, ele]. */
function calculateElevationGain(coords: number[][]): number {
  let gain = 0
  for (let i = 1; i < coords.length; i++) {
    const prevEle = coords[i - 1][2]
    const currEle = coords[i][2]
    if (prevEle != null && currEle != null && currEle > prevEle) {
      gain += currEle - prevEle
    }
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
