import type { RouteGeoJSON, RoutePreviewPoint } from '@/types/course'

const MAX_ROUTE_PREVIEW_POINTS = 200
// RDP tolerance in degree units (~5.5 m at Korean latitudes)
const RDP_EPSILON = 0.00005

/** Perpendicular distance from `pt` to line segment `[a, b]` in degree space. */
function rdpDistance(
  pt: RoutePreviewPoint,
  a: RoutePreviewPoint,
  b: RoutePreviewPoint,
): number {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  if (dx === 0 && dy === 0) {
    return Math.hypot(pt.lng - a.lng, pt.lat - a.lat)
  }
  const t = ((pt.lng - a.lng) * dx + (pt.lat - a.lat) * dy) / (dx * dx + dy * dy)
  return Math.hypot(pt.lng - (a.lng + t * dx), pt.lat - (a.lat + t * dy))
}

/**
 * Iterative Ramer-Douglas-Peucker simplification.
 * Preserves corners and tight curves; discards collinear points.
 */
function rdpSimplify(points: RoutePreviewPoint[], epsilon: number): RoutePreviewPoint[] {
  if (points.length <= 2) return points

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let maxIdx = start
    for (let i = start + 1; i < end; i++) {
      const d = rdpDistance(points[i], points[start], points[end])
      if (d > maxDist) { maxDist = d; maxIdx = i }
    }
    if (maxDist > epsilon) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }

  const result: RoutePreviewPoint[] = []
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i])
  }
  return result
}

function uniformSample(points: RoutePreviewPoint[], n: number): RoutePreviewPoint[] {
  const step = (points.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => points[Math.round(i * step)])
}

export function buildRoutePreview(
  routeGeoJson: RouteGeoJSON | null,
  maxPoints = MAX_ROUTE_PREVIEW_POINTS,
): RoutePreviewPoint[] {
  if (!routeGeoJson) return []

  const points: RoutePreviewPoint[] = []
  for (const feature of routeGeoJson.features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coordinate of feature.geometry.coordinates) {
      points.push({ lat: coordinate[1], lng: coordinate[0] })
    }
  }

  if (points.length <= maxPoints) return points

  // RDP: keeps curves, drops collinear points
  const simplified = rdpSimplify(points, RDP_EPSILON)

  if (simplified.length <= maxPoints) {
    // RDP result is already compact enough — use it as-is
    return simplified.length >= 4 ? simplified : uniformSample(points, Math.min(maxPoints, points.length))
  }

  // RDP still exceeds maxPoints (very dense winding route) — uniform sample down
  return uniformSample(simplified, maxPoints)
}

export function normalizeRoutePreviewPoints(points: RoutePreviewPoint[]) {
  if (points.length < 2) return []

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

  const width = Math.max(maxLng - minLng, 0.000001)
  const height = Math.max(maxLat - minLat, 0.000001)
  const inset = 8
  const drawable = 100 - inset * 2
  const scale = drawable / Math.max(width, height)
  const offsetX = inset + (drawable - width * scale) / 2
  const offsetY = inset + (drawable - height * scale) / 2

  return points.map((point) => {
    const x = offsetX + (point.lng - minLng) * scale
    const y = offsetY + (maxLat - point.lat) * scale
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
}

export function getRoutePreviewViewport(points: RoutePreviewPoint[]) {
  if (points.length === 0) {
    return {
      center: { lat: 36.7797, lng: 127.004 },
      level: 10,
    }
  }

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

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng
  const maxSpan = Math.max(latSpan, lngSpan)

  let level = 7
  if (maxSpan < 0.02) level = 8
  if (maxSpan < 0.01) level = 9
  if (maxSpan < 0.006) level = 10
  if (maxSpan < 0.003) level = 11

  return {
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
    level,
  }
}
