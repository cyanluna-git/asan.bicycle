import type { RouteGeoJSON, RouteHoverPoint } from '@/types/course'

export type { RouteHoverPoint } from '@/types/course'

function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadiusKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

export function buildRouteHoverProfile(routeGeoJSON: RouteGeoJSON | null | undefined): RouteHoverPoint[] {
  if (!routeGeoJSON) return []

  const points: RouteHoverPoint[] = []
  let cumKm = 0
  let previous: [number, number, number | undefined] | null = null

  for (const feature of routeGeoJSON.features) {
    if (feature.geometry?.type !== 'LineString') continue

    for (const rawCoordinate of feature.geometry.coordinates) {
      const coordinate = rawCoordinate as [number, number, number | undefined]
      const elevation = coordinate[2]

      if (typeof elevation !== 'number' || !Number.isFinite(elevation)) {
        previous = coordinate
        continue
      }

      if (previous) {
        cumKm += haversineKm(
          previous[1],
          previous[0],
          coordinate[1],
          coordinate[0],
        )
      }

      points.push({
        distanceKm: Math.round(cumKm * 100) / 100,
        elevationM: Math.round(elevation * 10) / 10,
        lat: coordinate[1],
        lng: coordinate[0],
      })

      previous = coordinate
    }
  }

  return points
}

/**
 * Smooth a raw GPS elevation profile:
 * 1. Linear-interpolate over zero-elevation gaps (GPX trkpt without <ele> tag → 0)
 * 2. Apply a 5-point moving-average to reduce GPS elevation noise
 */
export function smoothElevationProfile<T extends { distanceKm: number; elevationM: number }>(
  points: T[],
): T[] {
  if (points.length < 3) return points

  // Step 1: interpolate over elevation=0 runs (artifacts from missing <ele>)
  const buf = points.map((p) => ({ ...p })) as T[]
  let gapStart = -1
  for (let i = 0; i <= buf.length; i++) {
    const isGap = i < buf.length && buf[i].elevationM <= 0
    if (isGap) {
      if (gapStart === -1) gapStart = i
    } else {
      if (gapStart !== -1 && gapStart > 0 && i < buf.length) {
        const startEle = buf[gapStart - 1].elevationM
        const endEle = buf[i].elevationM
        const span = i - gapStart + 1
        for (let j = gapStart; j < i; j++) {
          const t = (j - gapStart + 1) / span
          buf[j] = { ...buf[j], elevationM: Math.round((startEle + t * (endEle - startEle)) * 10) / 10 }
        }
      }
      gapStart = -1
    }
  }

  // Step 2: 5-point moving average
  return buf.map((p, i) => {
    const lo = Math.max(0, i - 2)
    const hi = Math.min(buf.length - 1, i + 2)
    let sum = 0
    for (let j = lo; j <= hi; j++) sum += buf[j].elevationM
    return { ...p, elevationM: Math.round((sum / (hi - lo + 1)) * 10) / 10 }
  })
}

/** Binary search for the nearest point — profile is sorted by distanceKm. */
export function findNearestRouteHoverPoint(
  profile: RouteHoverPoint[],
  targetDistanceKm: number | null | undefined,
): RouteHoverPoint | null {
  if (profile.length === 0 || typeof targetDistanceKm !== 'number' || Number.isNaN(targetDistanceKm)) {
    return null
  }

  let lo = 0
  let hi = profile.length - 1

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (profile[mid].distanceKm < targetDistanceKm) lo = mid + 1
    else hi = mid
  }

  // lo is the first element >= target; compare with predecessor
  if (lo > 0) {
    const deltaLo = Math.abs(profile[lo].distanceKm - targetDistanceKm)
    const deltaPrev = Math.abs(profile[lo - 1].distanceKm - targetDistanceKm)
    if (deltaPrev < deltaLo) return profile[lo - 1]
  }

  return profile[lo]
}
