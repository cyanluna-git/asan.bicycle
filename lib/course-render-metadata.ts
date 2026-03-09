import type {
  ElevationPoint,
  RouteBounds,
  RouteGeoJSON,
  RoutePreviewPoint,
  RouteRenderMetadata,
  RouteSlopeSegment,
} from '@/types/course'
import { buildRouteHoverProfile, type RouteHoverPoint } from '@/lib/elevation-hover-sync'
import { buildSlopeDistanceSegments } from '@/lib/slope-visualization'

export const ROUTE_RENDER_METADATA_VERSION = 1

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function readNumber(value: unknown) {
  return isFiniteNumber(value) ? value : null
}

export function extractRoutePreviewPoints(routeGeoJSON: RouteGeoJSON | null | undefined): RoutePreviewPoint[] {
  if (!routeGeoJSON) return []

  const points: RoutePreviewPoint[] = []
  for (const feature of routeGeoJSON.features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coordinate of feature.geometry.coordinates) {
      points.push({ lat: coordinate[1], lng: coordinate[0] })
    }
  }

  return points
}

export function computeRouteBounds(points: RoutePreviewPoint[]): RouteBounds | null {
  if (points.length === 0) return null

  let minLat = points[0].lat
  let maxLat = points[0].lat
  let minLng = points[0].lng
  let maxLng = points[0].lng

  for (const point of points) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  return { minLat, maxLat, minLng, maxLng }
}

export function buildRouteRenderMetadata(
  routeGeoJSON: RouteGeoJSON | null | undefined,
): RouteRenderMetadata | null {
  if (!routeGeoJSON) return null

  const previewPoints = extractRoutePreviewPoints(routeGeoJSON)
  const bounds = computeRouteBounds(previewPoints)
  const hoverProfile = buildRouteHoverProfile(routeGeoJSON)
  const elevationProfile: ElevationPoint[] = hoverProfile.map(({ distanceKm, elevationM }) => ({
    distanceKm,
    elevationM,
  }))
  const slopeSegments: RouteSlopeSegment[] = buildSlopeDistanceSegments(elevationProfile).map(
    ({ startKm, endKm, slopePct }) => ({
      startKm,
      endKm,
      slopePct,
    }),
  )

  return {
    version: ROUTE_RENDER_METADATA_VERSION,
    bounds,
    hoverProfile,
    slopeSegments,
  }
}

export function getElevationProfileFromMetadata(
  metadata: RouteRenderMetadata | null | undefined,
): ElevationPoint[] {
  return (metadata?.hoverProfile ?? []).map(({ distanceKm, elevationM }) => ({
    distanceKm,
    elevationM,
  }))
}

function normalizeBounds(value: unknown): RouteBounds | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  const minLat = readNumber(candidate.minLat)
  const maxLat = readNumber(candidate.maxLat)
  const minLng = readNumber(candidate.minLng)
  const maxLng = readNumber(candidate.maxLng)

  if ([minLat, maxLat, minLng, maxLng].some((item) => item == null)) {
    return null
  }

  return {
    minLat: minLat!,
    maxLat: maxLat!,
    minLng: minLng!,
    maxLng: maxLng!,
  }
}

function normalizeHoverProfile(value: unknown): RouteHoverPoint[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    const distanceKm = readNumber(candidate.distanceKm)
    const elevationM = readNumber(candidate.elevationM)
    const lat = readNumber(candidate.lat)
    const lng = readNumber(candidate.lng)

    if ([distanceKm, elevationM, lat, lng].some((item) => item == null)) {
      return []
    }

    return [{
      distanceKm: Math.round(distanceKm! * 100) / 100,
      elevationM: Math.round(elevationM! * 10) / 10,
      lat: lat!,
      lng: lng!,
    }]
  })
}

function normalizeSlopeSegments(value: unknown): RouteSlopeSegment[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    const startKm = readNumber(candidate.startKm)
    const endKm = readNumber(candidate.endKm)
    const slopePct = readNumber(candidate.slopePct)

    if ([startKm, endKm, slopePct].some((item) => item == null) || endKm! <= startKm!) {
      return []
    }

    return [{
      startKm: Math.round(startKm! * 100) / 100,
      endKm: Math.round(endKm! * 100) / 100,
      slopePct: Math.round(slopePct! * 10) / 10,
    }]
  })
}

export function normalizeRouteRenderMetadata(value: unknown): RouteRenderMetadata | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Record<string, unknown>
  const version = readNumber(candidate.version)
  const bounds = normalizeBounds(candidate.bounds)
  const hoverProfile = normalizeHoverProfile(candidate.hoverProfile)
  const slopeSegments = normalizeSlopeSegments(candidate.slopeSegments)

  if (version == null || hoverProfile.length === 0) {
    return null
  }

  return {
    version,
    bounds,
    hoverProfile,
    slopeSegments,
  }
}
