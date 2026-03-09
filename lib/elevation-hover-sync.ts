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

export function findNearestRouteHoverPoint(
  profile: RouteHoverPoint[],
  targetDistanceKm: number | null | undefined,
) {
  if (profile.length === 0 || typeof targetDistanceKm !== 'number' || Number.isNaN(targetDistanceKm)) {
    return null
  }

  let nearest = profile[0]
  let nearestDelta = Math.abs(profile[0].distanceKm - targetDistanceKm)

  for (let i = 1; i < profile.length; i++) {
    const candidate = profile[i]
    const delta = Math.abs(candidate.distanceKm - targetDistanceKm)

    if (delta < nearestDelta) {
      nearest = candidate
      nearestDelta = delta
    }
  }

  return nearest
}
