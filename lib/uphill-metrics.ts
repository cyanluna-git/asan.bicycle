import { buildRouteHoverProfile } from '@/lib/elevation-hover-sync'
import type { RouteHoverPoint } from '@/lib/elevation-hover-sync'
import type { RouteGeoJSON, UphillSegment } from '@/types/course'

export type UphillMetrics = {
  lengthKm: number
  elevationGainM: number
  averageGradientPct: number
}

function computeElevationGain(points: RouteHoverPoint[]) {
  let gain = 0

  for (let i = 1; i < points.length; i++) {
    const delta = points[i].elevationM - points[i - 1].elevationM
    if (delta > 0) {
      gain += delta
    }
  }

  return gain
}

export function getUphillMetrics(
  profile: RouteHoverPoint[],
  segment: Pick<UphillSegment, 'start_km' | 'end_km'>,
): UphillMetrics | null {
  if (profile.length < 2) return null

  const segmentPoints = profile.filter(
    (point) => point.distanceKm >= segment.start_km && point.distanceKm <= segment.end_km,
  )

  if (segmentPoints.length < 2) return null

  const lengthKm = Math.max(segment.end_km - segment.start_km, 0)
  if (lengthKm <= 0) return null

  const elevationGainM = computeElevationGain(segmentPoints)
  const averageGradientPct = (elevationGainM / (lengthKm * 1000)) * 100

  return {
    lengthKm: Math.round(lengthKm * 100) / 100,
    elevationGainM: Math.round(elevationGainM),
    averageGradientPct: Math.round(averageGradientPct * 10) / 10,
  }
}

export function getUphillMetricsMap(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  segments: UphillSegment[],
) {
  const profile = buildRouteHoverProfile(routeGeoJSON)

  return new Map(
    segments
      .map((segment) => [segment.id, getUphillMetrics(profile, segment)] as const)
      .filter((entry): entry is readonly [string, UphillMetrics] => entry[1] !== null),
  )
}
