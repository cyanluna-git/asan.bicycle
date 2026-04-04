import type { RouteGeoJSON } from '@/types/course'
import type {
  HourlyForecast,
  PrecipitationType,
  SkyCondition,
} from '@/types/weather'

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

export type RouteForecasts = {
  atKm: number
  lat: number
  lng: number
  forecasts: HourlyForecast[]
}[]

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

export function haversineKm(
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
// Collect route points with cumulative distance
// ---------------------------------------------------------------------------

export type RoutePoint = { lat: number; lng: number; km: number }

export function collectRoutePoints(
  routeGeoJSON: RouteGeoJSON | null | undefined,
): RoutePoint[] {
  if (!routeGeoJSON) return []

  const points: RoutePoint[] = []

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

  return points
}

// ---------------------------------------------------------------------------
// Sample route points at fixed km intervals (multi-grid weather)
// ---------------------------------------------------------------------------

export function sampleRouteAtKmIntervals(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  intervalKm: number = 50,
): { atKm: number; lat: number; lng: number }[] {
  const points = collectRoutePoints(routeGeoJSON)
  if (points.length === 0) return []

  const totalKm = points[points.length - 1].km
  const result: { atKm: number; lat: number; lng: number }[] = []

  if (totalKm < intervalKm) {
    // Route shorter than interval — return only the start
    const { lat, lng } = interpolatePointAtKm(points, 0)
    result.push({ atKm: 0, lat, lng })
    return result
  }

  for (let km = 0; km <= totalKm; km += intervalKm) {
    const { lat, lng } = interpolatePointAtKm(points, km)
    result.push({ atKm: km, lat, lng })
  }

  return result
}

// ---------------------------------------------------------------------------
// Pick forecasts by geographic proximity
// ---------------------------------------------------------------------------

export function pickForecastsByLocation(
  routeForecasts: RouteForecasts,
  lat: number,
  lng: number,
): HourlyForecast[] {
  if (routeForecasts.length === 0) return []

  let best = routeForecasts[0]
  let bestDist = haversineKm(lat, lng, best.lat, best.lng)

  for (let i = 1; i < routeForecasts.length; i++) {
    const dist = haversineKm(lat, lng, routeForecasts[i].lat, routeForecasts[i].lng)
    if (dist < bestDist) {
      best = routeForecasts[i]
      bestDist = dist
    }
  }

  return best.forecasts
}

// ---------------------------------------------------------------------------
// Build riding forecast sequence (per-hour, location-aware)
// ---------------------------------------------------------------------------

export function buildRidingForecastSequence(
  routePoints: RoutePoint[],
  routeForecasts: RouteForecasts,
  departureTime: string,
  avgSpeedKmh: number,
): HourlyForecast[] {
  if (routePoints.length < 2 || routeForecasts.length === 0 || avgSpeedKmh <= 0) return []

  const totalKm = routePoints[routePoints.length - 1].km
  const departureMs = new Date(departureTime).getTime()
  const depHour = new Date(departureMs).getHours()
  const ridingHours = totalKm / avgSpeedKmh
  const endHour = depHour + Math.ceil(ridingHours) + 1

  const result: HourlyForecast[] = []

  for (let h = depHour; h <= endHour; h++) {
    const elapsedHours = h - depHour
    const km = elapsedHours * avgSpeedKmh
    const { lat, lng } = interpolatePointAtKm(routePoints, km)

    // Get forecasts from nearest grid
    const forecasts = pickForecastsByLocation(routeForecasts, lat, lng)
    if (forecasts.length === 0) continue

    // Find forecast closest to this hour
    const targetMs = departureMs + elapsedHours * 3600_000
    const parsed = forecasts.map((f) => ({ ...f, ms: new Date(f.datetime).getTime() }))
    const nearest = findNearestForecast(parsed, targetMs)
    if (!nearest) continue

    // Build entry with the target hour's datetime
    const targetDate = new Date(targetMs)
    const yyyy = targetDate.getFullYear()
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0')
    const dd = String(targetDate.getDate()).padStart(2, '0')
    const hh = String(targetDate.getHours()).padStart(2, '0')

    result.push({
      datetime: `${yyyy}-${mm}-${dd}T${hh}:00`,
      temperature: nearest.temperature,
      windSpeed: nearest.windSpeed,
      windDirection: nearest.windDirection,
      precipitationProbability: nearest.precipitationProbability,
      skyCondition: nearest.skyCondition,
      precipitationType: nearest.precipitationType,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Helpers: detect RouteForecasts vs HourlyForecast[], resolve forecasts per-location
// ---------------------------------------------------------------------------

function isRouteForecasts(
  input: RouteForecasts | HourlyForecast[],
): input is RouteForecasts {
  return input.length > 0 && 'atKm' in input[0]
}

function toRouteForecasts(
  input: RouteForecasts | HourlyForecast[],
): RouteForecasts {
  if (isRouteForecasts(input)) return input
  return [{ atKm: 0, lat: 0, lng: 0, forecasts: input }]
}

function resolveForecasts(
  routeForecasts: RouteForecasts,
  lat: number,
  lng: number,
): (HourlyForecast & { ms: number })[] {
  const forecasts = pickForecastsByLocation(routeForecasts, lat, lng)
  return forecasts.map((f) => ({ ...f, ms: new Date(f.datetime).getTime() }))
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

  const points = collectRoutePoints(routeGeoJSON)
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
// Build time-aware wind segments (per-segment forecast lookup)
// ---------------------------------------------------------------------------

/**
 * Build wind segments where each segment uses the forecast closest to the
 * estimated arrival time at that point along the route.
 *
 * @param routeGeoJSON   Route geometry
 * @param forecasts      Hourly forecasts or multi-grid RouteForecasts
 * @param departureTime  ISO datetime string for departure (e.g. "2026-04-02T07:00")
 * @param avgSpeedKmh    Average riding speed in km/h
 */
export function buildTimeAwareWindSegments(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  forecasts: RouteForecasts | HourlyForecast[],
  departureTime: string,
  avgSpeedKmh: number,
): WindSegment[] {
  if (!routeGeoJSON || forecasts.length === 0 || avgSpeedKmh <= 0) return []

  const points = collectRoutePoints(routeGeoJSON)
  if (points.length < 2) return []

  const sampled = downsample(points, MAX_SEGMENTS)
  const departureMs = new Date(departureTime).getTime()
  const rf = toRouteForecasts(forecasts)

  const segments: WindSegment[] = []

  for (let i = 1; i < sampled.length; i++) {
    const prev = sampled[i - 1]
    const curr = sampled[i]

    // Midpoint distance and location of this segment
    const midKm = (prev.km + curr.km) / 2
    const midLat = (prev.lat + curr.lat) / 2
    const midLng = (prev.lng + curr.lng) / 2
    const arrivalMs = departureMs + (midKm / avgSpeedKmh) * 3600_000

    // Resolve forecasts by geographic proximity, then find nearest by time
    const parsedForecasts = resolveForecasts(rf, midLat, midLng)
    const forecast = findNearestForecast(parsedForecasts, arrivalMs)
    if (!forecast) continue

    const bearing = calculateBearing(prev.lat, prev.lng, curr.lat, curr.lng)
    const classification = classifyWind(bearing, forecast.windDirection)
    const angleDiff = Math.abs(((bearing - forecast.windDirection) + 540) % 360 - 180)
    const effectiveSpeed = forecast.windSpeed * Math.cos(angleDiff * TO_RAD)

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

function findNearestForecast<T extends { ms: number }>(
  forecasts: T[],
  targetMs: number,
): T | null {
  if (forecasts.length === 0) return null

  let best = forecasts[0]
  let bestDiff = Math.abs(best.ms - targetMs)

  for (let i = 1; i < forecasts.length; i++) {
    const diff = Math.abs(forecasts[i].ms - targetMs)
    if (diff < bestDiff) {
      best = forecasts[i]
      bestDiff = diff
    }
  }

  return best
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

// ---------------------------------------------------------------------------
// Map overlay types
// ---------------------------------------------------------------------------

export type WindMapOverlay = {
  lat: number
  lng: number
  windDirection: number
  windSpeed: number
  classification: WindClassification
}

export type WeatherMapPoint = {
  lat: number
  lng: number
  temperature: number
  skyCondition: SkyCondition
  precipitationType: PrecipitationType
  label: string
  estimatedTime: string
}

// ---------------------------------------------------------------------------
// Interpolate a point at a given cumulative km along the route
// ---------------------------------------------------------------------------

function interpolatePointAtKm(
  routePoints: RoutePoint[],
  targetKm: number,
): { lat: number; lng: number } {
  if (routePoints.length === 0) return { lat: 0, lng: 0 }

  // Clamp to route bounds
  if (targetKm <= 0) return { lat: routePoints[0].lat, lng: routePoints[0].lng }

  const last = routePoints[routePoints.length - 1]
  if (targetKm >= last.km) return { lat: last.lat, lng: last.lng }

  // Find the segment that contains targetKm
  for (let i = 1; i < routePoints.length; i++) {
    if (routePoints[i].km >= targetKm) {
      const prev = routePoints[i - 1]
      const curr = routePoints[i]
      const segLen = curr.km - prev.km
      if (segLen <= 0) return { lat: prev.lat, lng: prev.lng }

      const ratio = (targetKm - prev.km) / segLen
      return {
        lat: prev.lat + (curr.lat - prev.lat) * ratio,
        lng: prev.lng + (curr.lng - prev.lng) * ratio,
      }
    }
  }

  return { lat: last.lat, lng: last.lng }
}

// ---------------------------------------------------------------------------
// Build wind map overlays at regular km intervals
// ---------------------------------------------------------------------------

export function buildWindMapOverlays(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  forecasts: RouteForecasts | HourlyForecast[],
  departureTime: string,
  avgSpeedKmh: number,
  intervalKm: number = 10,
): WindMapOverlay[] {
  if (!routeGeoJSON || forecasts.length === 0 || avgSpeedKmh <= 0 || intervalKm <= 0) {
    return []
  }

  const points = collectRoutePoints(routeGeoJSON)
  if (points.length < 2) return []

  const totalKm = points[points.length - 1].km
  const departureMs = new Date(departureTime).getTime()
  const rf = toRouteForecasts(forecasts)

  const overlays: WindMapOverlay[] = []

  for (let km = 0; km <= totalKm; km += intervalKm) {
    const { lat, lng } = interpolatePointAtKm(points, km)
    const arrivalMs = departureMs + (km / avgSpeedKmh) * 3600_000

    const parsedForecasts = resolveForecasts(rf, lat, lng)
    const forecast = findNearestForecast(parsedForecasts, arrivalMs)
    if (!forecast) continue

    // Determine riding bearing at this point
    const nextKm = Math.min(km + 0.5, totalKm)
    const nextPt = interpolatePointAtKm(points, nextKm)
    const bearing = calculateBearing(lat, lng, nextPt.lat, nextPt.lng)

    overlays.push({
      lat,
      lng,
      windDirection: forecast.windDirection,
      windSpeed: forecast.windSpeed,
      classification: classifyWind(bearing, forecast.windDirection),
    })
  }

  return overlays
}

// ---------------------------------------------------------------------------
// Build weather map points at fixed route proportions
// ---------------------------------------------------------------------------

const WEATHER_POINT_RATIOS = [0, 1 / 3, 2 / 3, 1] as const
const WEATHER_POINT_LABELS = ['출발', '경유', '경유', '도착'] as const

export function buildWeatherMapPoints(
  routeGeoJSON: RouteGeoJSON | null | undefined,
  forecasts: RouteForecasts | HourlyForecast[],
  departureTime: string,
  avgSpeedKmh: number,
): WeatherMapPoint[] {
  if (!routeGeoJSON || forecasts.length === 0 || avgSpeedKmh <= 0) return []

  const points = collectRoutePoints(routeGeoJSON)
  if (points.length < 2) return []

  const totalKm = points[points.length - 1].km
  const departureMs = new Date(departureTime).getTime()
  const rf = toRouteForecasts(forecasts)

  const result: WeatherMapPoint[] = []

  for (let i = 0; i < WEATHER_POINT_RATIOS.length; i++) {
    const km = totalKm * WEATHER_POINT_RATIOS[i]
    const { lat, lng } = interpolatePointAtKm(points, km)
    const arrivalMs = departureMs + (km / avgSpeedKmh) * 3600_000

    const parsedForecasts = resolveForecasts(rf, lat, lng)
    const forecast = findNearestForecast(parsedForecasts, arrivalMs)
    if (!forecast) continue

    const estimatedDate = new Date(arrivalMs)
    const hh = String(estimatedDate.getHours()).padStart(2, '0')
    const mm = String(estimatedDate.getMinutes()).padStart(2, '0')

    result.push({
      lat,
      lng,
      temperature: forecast.temperature,
      skyCondition: forecast.skyCondition,
      precipitationType: forecast.precipitationType,
      label: WEATHER_POINT_LABELS[i],
      estimatedTime: `${hh}:${mm}`,
    })
  }

  return result
}
