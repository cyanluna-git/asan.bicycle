import type { RouteGeoJSON } from '@/types/course'

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

export function buildSlopePolylineSegments(routeGeoJSON: RouteGeoJSON | null | undefined): SlopePolylineSegment[] {
  if (!routeGeoJSON) return []

  const rawSegments: Array<{
    path: Array<{ lat: number; lng: number }>
    slopePct: number
  }> = []

  for (const feature of routeGeoJSON.features) {
    if (feature.geometry?.type !== 'LineString') continue

    const coordinates = feature.geometry.coordinates
    for (let i = 1; i < coordinates.length; i++) {
      const previous = coordinates[i - 1]
      const current = coordinates[i]
      const previousElevation = previous[2]
      const currentElevation = current[2]

      if (typeof previousElevation !== 'number' || typeof currentElevation !== 'number') {
        continue
      }

      const distanceKm = haversineKm(previous[1], previous[0], current[1], current[0])
      if (distanceKm <= 0) continue

      rawSegments.push({
        path: [
          { lat: previous[1], lng: previous[0] },
          { lat: current[1], lng: current[0] },
        ],
        slopePct: ((currentElevation - previousElevation) / (distanceKm * 1000)) * 100,
      })
    }
  }

  if (rawSegments.length === 0) return []

  const smoothed = smoothSlopeValues(rawSegments.map((segment) => segment.slopePct))

  return rawSegments.map((segment, index) => {
    const slopePct = smoothed[index]
    const band = classifySlopeBand(slopePct)

    return {
      path: segment.path,
      slopePct,
      band,
      color: SLOPE_BANDS[band].color,
    }
  })
}

export function getSlopeBandMeta(slopePct: number) {
  return SLOPE_BANDS[classifySlopeBand(slopePct)]
}
