import type { RouteGeoJSON } from '@/types/course'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindClassification = 'headwind' | 'tailwind' | 'crosswind'

export type WindSegment = {
  startKm: number
  endKm: number
  classification: WindClassification
  effectiveSpeed: number
  color: string
}

export type WindSummary = {
  headwindPercent: number
  tailwindPercent: number
  crosswindPercent: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WIND_COLORS: Record<WindClassification, string> = {
  headwind: '#EF4444',
  tailwind: '#3B82F6',
  crosswind: '#9CA3AF',
}

export const WIND_LABELS: Record<WindClassification, string> = {
  headwind: '역풍',
  tailwind: '순풍',
  crosswind: '측풍',
}

const TO_RAD = Math.PI / 180
const TO_DEG = 180 / Math.PI
const EARTH_RADIUS_KM = 6371
const MAX_SEGMENTS = 200

// ---------------------------------------------------------------------------
// Bearing calculation
// ---------------------------------------------------------------------------

export function calculateBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLng = (lng2 - lng1) * TO_RAD
  const lat1Rad = lat1 * TO_RAD
  const lat2Rad = lat2 * TO_RAD

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)

  return ((Math.atan2(y, x) * TO_DEG) + 360) % 360
}

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = (bLat - aLat) * TO_RAD
  const dLng = (bLng - aLng) * TO_RAD
  const lat1 = aLat * TO_RAD
  const lat2 = bLat * TO_RAD

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

// ---------------------------------------------------------------------------
// Wind classification
// ---------------------------------------------------------------------------

/**
 * Classify the wind effect on a rider travelling in `ridingBearing` direction
 * while wind blows FROM `windFromDirection` (KMA VEC convention).
 *
 * The wind-travel angle is computed as the difference between the rider's
 * bearing and the direction the wind is coming FROM:
 * - 0-30 / 330-360  => headwind  (wind blowing into the rider's face)
 * - 150-210          => tailwind  (wind pushing the rider forward)
 * - otherwise        => crosswind
 */
export function classifyWind(
  ridingBearing: number,
  windFromDirection: number,
): WindClassification {
  const diff = Math.abs(((ridingBearing - windFromDirection) + 540) % 360 - 180)

  if (diff <= 30) return 'headwind'
  if (diff >= 150) return 'tailwind'
  return 'crosswind'
}

// ---------------------------------------------------------------------------
// Build wind segments from route GeoJSON
// ---------------------------------------------------------------------------

export function buildWindSegments(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  windFromDirection: number,
  windSpeed: number,
): WindSegment[] {
  if (!routeGeoJSON || windSpeed <= 0) return []

  // Collect all coordinate pairs with cumulative distance
  const points: Array<{ lat: number; lng: number; km: number }> = []

  for (const feature of routeGeoJSON.features) {
    if (feature.geometry?.type !== 'LineString') continue

    const coords = feature.geometry.coordinates
    for (let i = 0; i < coords.length; i++) {
      const lng = coords[i][0]
      const lat = coords[i][1]

      if (points.length === 0) {
        points.push({ lat, lng, km: 0 })
      } else {
        const prev = points[points.length - 1]
        const dist = haversineKm(prev.lat, prev.lng, lat, lng)
        if (dist > 0) {
          points.push({ lat, lng, km: prev.km + dist })
        }
      }
    }
  }

  if (points.length < 2) return []

  // Down-sample if too many coordinates
  const sampled = downsample(points, MAX_SEGMENTS)

  const segments: WindSegment[] = []

  for (let i = 1; i < sampled.length; i++) {
    const prev = sampled[i - 1]
    const curr = sampled[i]

    const bearing = calculateBearing(prev.lat, prev.lng, curr.lat, curr.lng)
    const classification = classifyWind(bearing, windFromDirection)

    // effective speed = windSpeed * cos(angleDiff between riding bearing and wind-FROM)
    const angleDiff = Math.abs(((bearing - windFromDirection) + 540) % 360 - 180)
    const effectiveSpeed = windSpeed * Math.cos(angleDiff * TO_RAD)

    segments.push({
      startKm: prev.km,
      endKm: curr.km,
      classification,
      effectiveSpeed: Math.round(effectiveSpeed * 10) / 10,
      color: WIND_COLORS[classification],
    })
  }

  return segments
}

// ---------------------------------------------------------------------------
// Down-sample helper
// ---------------------------------------------------------------------------

function downsample<T extends { km: number }>(
  points: T[],
  maxSegments: number,
): T[] {
  if (points.length <= maxSegments + 1) return points

  const totalKm = points[points.length - 1].km
  const step = totalKm / maxSegments
  const result: T[] = [points[0]]

  let nextTarget = step
  for (let i = 1; i < points.length; i++) {
    if (points[i].km >= nextTarget || i === points.length - 1) {
      result.push(points[i])
      nextTarget = points[i].km + step
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Summarize wind segments
// ---------------------------------------------------------------------------

export function summarizeWind(segments: WindSegment[]): WindSummary {
  if (segments.length === 0) {
    return { headwindPercent: 0, tailwindPercent: 0, crosswindPercent: 0 }
  }

  let headwindKm = 0
  let tailwindKm = 0
  let crosswindKm = 0

  for (const seg of segments) {
    const km = seg.endKm - seg.startKm
    switch (seg.classification) {
      case 'headwind':
        headwindKm += km
        break
      case 'tailwind':
        tailwindKm += km
        break
      case 'crosswind':
        crosswindKm += km
        break
    }
  }

  const totalKm = headwindKm + tailwindKm + crosswindKm
  if (totalKm <= 0) {
    return { headwindPercent: 0, tailwindPercent: 0, crosswindPercent: 0 }
  }

  return {
    headwindPercent: Math.round((headwindKm / totalKm) * 100),
    tailwindPercent: Math.round((tailwindKm / totalKm) * 100),
    crosswindPercent: Math.round((crosswindKm / totalKm) * 100),
  }
}
