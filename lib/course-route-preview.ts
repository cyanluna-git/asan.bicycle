import type { RouteGeoJSON, RoutePreviewPoint } from '@/types/course'

const MAX_ROUTE_PREVIEW_POINTS = 48

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

  if (points.length <= maxPoints) {
    return points
  }

  const sampled: RoutePreviewPoint[] = []
  const step = (points.length - 1) / (maxPoints - 1)
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round(index * step)])
  }

  return sampled
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
