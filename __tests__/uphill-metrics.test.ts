import { describe, expect, it } from 'vitest'
import { getUphillMetrics, getUphillMetricsMap } from '@/lib/uphill-metrics'
import { buildRouteHoverProfile } from '@/lib/elevation-hover-sync'
import type { RouteGeoJSON, UphillSegment } from '@/types/course'

const SAMPLE_ROUTE: RouteGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [127.0, 36.0, 100],
          [127.001, 36.0, 110],
          [127.002, 36.0, 120],
          [127.003, 36.0, 126],
        ],
      },
    },
  ],
}

const SAMPLE_SEGMENT: UphillSegment = {
  id: 'seg-1',
  course_id: 'course-1',
  name: '업힐 1',
  start_km: 0,
  end_km: 0.27,
  created_at: '2026-03-09T00:00:00Z',
}

describe('getUphillMetrics', () => {
  it('computes average gradient, gain, and length for an uphill segment', () => {
    const profile = buildRouteHoverProfile(SAMPLE_ROUTE)
    const metrics = getUphillMetrics(profile, SAMPLE_SEGMENT)

    expect(metrics).not.toBeNull()
    expect(metrics).toMatchObject({
      elevationGainM: 26,
      lengthKm: 0.27,
    })
    expect(metrics!.averageGradientPct).toBeCloseTo(9.6, 1)
  })

  it('returns null when there are not enough points inside the segment', () => {
    const profile = buildRouteHoverProfile(SAMPLE_ROUTE)

    expect(
      getUphillMetrics(profile, {
        start_km: 0.28,
        end_km: 0.29,
      }),
    ).toBeNull()
  })
})

describe('getUphillMetricsMap', () => {
  it('builds a lookup map keyed by segment id', () => {
    const metricsMap = getUphillMetricsMap(SAMPLE_ROUTE, [SAMPLE_SEGMENT])

    expect(metricsMap.has('seg-1')).toBe(true)
    expect(metricsMap.get('seg-1')?.elevationGainM).toBe(26)
  })
})
