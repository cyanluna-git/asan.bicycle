import type { ElevationPoint, RouteGeoJSON, RouteSlopeSegment } from '@/types/course'

export type SlopeBandKey =
  | 'descent'
  | 'flat'
  | 'gentle'
  | 'moderate'
  | 'steep'
  | 'extreme'

export type SlopeBandMeta = {
  key: SlopeBandKey
  label: string
  rangeLabel: string
  color: string
  textClassName: string
  chipClassName: string
}

export type SlopePolylineSegment = {
  path: Array<{ lat: number; lng: number }>
  slopePct: number
  band: SlopeBandKey
  color: string
}

export type SlopeGradientStop = {
  offset: string
  color: string
  opacity?: number
}

export type SlopeDistanceSegment = {
  startKm: number
  endKm: number
  slopePct: number
  band: SlopeBandKey
  color: string
}

const TO_RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371
const SMOOTHING_WINDOW = 1

export const SLOPE_BANDS: Record<SlopeBandKey, SlopeBandMeta> = {
  descent: {
    key: 'descent',
    label: '내리막',
    rangeLabel: '< 0%',
    color: '#94a3b8',
    textClassName: 'text-slate-500',
    chipClassName: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  flat: {
    key: 'flat',
    label: '평지',
    rangeLabel: '0~1%',
    color: '#22c55e',
    textClassName: 'text-emerald-600',
    chipClassName: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  },
  gentle: {
    key: 'gentle',
    label: '완만',
    rangeLabel: '1~5%',
    color: '#eab308',
    textClassName: 'text-amber-600',
    chipClassName: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  moderate: {
    key: 'moderate',
    label: '오르막',
    rangeLabel: '5~8%',
    color: '#f97316',
    textClassName: 'text-orange-600',
    chipClassName: 'bg-orange-100 text-orange-800 ring-orange-200',
  },
  steep: {
    key: 'steep',
    label: '급경사',
    rangeLabel: '8~12%',
    color: '#ef4444',
    textClassName: 'text-red-600',
    chipClassName: 'bg-red-100 text-red-700 ring-red-200',
  },
  extreme: {
    key: 'extreme',
    label: '초급경사',
    rangeLabel: '12%+',
    color: '#991b1b',
    textClassName: 'text-red-900',
    chipClassName: 'bg-red-200 text-red-950 ring-red-300',
  },
}

export const SLOPE_LEGEND_ORDER: SlopeBandKey[] = [
  'descent',
  'flat',
  'gentle',
  'moderate',
  'steep',
  'extreme',
]

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = (bLat - aLat) * TO_RAD
  const dLng = (bLng - aLng) * TO_RAD
  const lat1 = aLat * TO_RAD
  const lat2 = bLat * TO_RAD

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

export function classifySlopeBand(slopePct: number): SlopeBandKey {
  if (slopePct < 0) return 'descent'
  if (slopePct <= 1) return 'flat'
  if (slopePct <= 5) return 'gentle'
  if (slopePct <= 8) return 'moderate'
  if (slopePct <= 12) return 'steep'
  return 'extreme'
}

function smoothSlopeValues(values: number[]) {
  return values.map((_, index) => {
    const start = Math.max(0, index - SMOOTHING_WINDOW)
    const end = Math.min(values.length - 1, index + SMOOTHING_WINDOW)
    const window = values.slice(start, end + 1)
    const average = window.reduce((sum, value) => sum + value, 0) / window.length
    return Math.round(average * 10) / 10
  })
}

export function buildSlopeDistanceSegments(profile: ElevationPoint[]): SlopeDistanceSegment[] {
  const rawSegments: Array<{
    startKm: number
    endKm: number
    slopePct: number
  }> = []

  for (let i = 1; i < profile.length; i++) {
    const previous = profile[i - 1]
    const current = profile[i]
    const distanceKm = current.distanceKm - previous.distanceKm

    if (distanceKm <= 0) continue

    rawSegments.push({
      startKm: previous.distanceKm,
      endKm: current.distanceKm,
      slopePct: ((current.elevationM - previous.elevationM) / (distanceKm * 1000)) * 100,
    })
  }

  if (rawSegments.length === 0) return []

  const smoothed = smoothSlopeValues(rawSegments.map((segment) => segment.slopePct))

  return rawSegments.map((segment, index) => {
    const slopePct = smoothed[index]
    const band = classifySlopeBand(slopePct)

    return {
      ...segment,
      slopePct,
      band,
      color: SLOPE_BANDS[band].color,
    }
  })
}

export function inflateSlopeDistanceSegments(
  segments: RouteSlopeSegment[],
): SlopeDistanceSegment[] {
  return segments
    .filter((segment) => segment.endKm > segment.startKm)
    .map((segment) => {
      const band = classifySlopeBand(segment.slopePct)
      return {
        startKm: segment.startKm,
        endKm: segment.endKm,
        slopePct: segment.slopePct,
        band,
        color: SLOPE_BANDS[band].color,
      }
    })
}

/**
 * Build slope-colored polyline segments for map rendering.
 *
 * Instead of one 2-point Polyline per GPS segment (which creates thousands of
 * independent components and causes visual artifacts at sharp corners), this
 * groups consecutive same-band GPS points into a single continuous Polyline.
 * Each group shares one endpoint with the next group to ensure gapless rendering.
 *
 * Result: ~5–50 Polyline components instead of thousands.
 */
export function buildSlopePolylineSegments(routeGeoJSON: RouteGeoJSON | null | undefined): SlopePolylineSegment[] {
  if (!routeGeoJSON) return []

  type RawPt = { lat: number; lng: number }
  type RawSeg = { start: RawPt; end: RawPt; slopePct: number }

  const rawSegs: RawSeg[] = []

  for (const feature of routeGeoJSON.features) {
    if (feature.geometry?.type !== 'LineString') continue
    const coords = feature.geometry.coordinates
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1]
      const curr = coords[i]
      const prevEle = prev[2]
      const currEle = curr[2]
      if (typeof prevEle !== 'number' || typeof currEle !== 'number') continue
      const distKm = haversineKm(prev[1], prev[0], curr[1], curr[0])
      if (distKm <= 0) continue
      rawSegs.push({
        start: { lat: prev[1], lng: prev[0] },
        end: { lat: curr[1], lng: curr[0] },
        slopePct: ((currEle - prevEle) / (distKm * 1000)) * 100,
      })
    }
  }

  if (rawSegs.length === 0) return []

  const smoothed = smoothSlopeValues(rawSegs.map((s) => s.slopePct))

  // Assign a band to each raw segment
  const bands = smoothed.map((s) => classifySlopeBand(s))

  // Group consecutive same-band segments into one continuous Polyline.
  // Each group's path includes the start of the first seg through the end of
  // the last seg. Adjacent groups share one endpoint (no visual gap).
  const grouped: SlopePolylineSegment[] = []
  let groupStart = 0

  for (let i = 1; i <= rawSegs.length; i++) {
    if (i === rawSegs.length || bands[i] !== bands[groupStart]) {
      const band = bands[groupStart]
      const path: RawPt[] = [rawSegs[groupStart].start]
      for (let j = groupStart; j < i; j++) {
        path.push(rawSegs[j].end)
      }
      grouped.push({
        path,
        slopePct: smoothed[groupStart],
        band,
        color: SLOPE_BANDS[band].color,
      })
      groupStart = i
    }
  }

  return grouped
}

export function getSlopeBandMeta(slopePct: number) {
  return SLOPE_BANDS[classifySlopeBand(slopePct)]
}

export function buildSlopeGradientStops(profile: ElevationPoint[], opacity = 1): SlopeGradientStop[] {
  return buildSlopeGradientStopsFromSegments(buildSlopeDistanceSegments(profile), opacity)
}

export function buildSlopeGradientStopsFromSegments(
  segments: Array<Pick<SlopeDistanceSegment, 'startKm' | 'endKm' | 'color'>>,
  opacity = 1,
): SlopeGradientStop[] {
  if (segments.length === 0) return []

  const startKm = segments[0].startKm
  const endKm = segments[segments.length - 1].endKm
  const totalKm = endKm - startKm
  if (totalKm <= 0) return []

  const stops: SlopeGradientStop[] = []

  for (const segment of segments) {
    const startOffset = `${(((segment.startKm - startKm) / totalKm) * 100).toFixed(2)}%`
    const endOffset = `${(((segment.endKm - startKm) / totalKm) * 100).toFixed(2)}%`

    if (stops.length === 0) {
      stops.push({ offset: startOffset, color: segment.color, opacity })
    }

    stops.push({ offset: startOffset, color: segment.color, opacity })
    stops.push({ offset: endOffset, color: segment.color, opacity })
  }

  const last = segments[segments.length - 1]
  stops.push({ offset: '100%', color: last.color, opacity })

  return stops
}
