import { describe, expect, it } from 'vitest'
import {
  buildRouteRenderMetadata,
  getElevationProfileFromMetadata,
  normalizeRouteRenderMetadata,
} from '@/lib/course-render-metadata'
import type { RouteGeoJSON } from '@/types/course'

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
          [127.003, 36.001, 110],
          [127.006, 36.002, 108],
          [127.009, 36.003, 132],
        ],
      },
    },
  ],
}

describe('buildRouteRenderMetadata', () => {
  it('builds reusable bounds, hover profile, and slope segments from route geojson', () => {
    const metadata = buildRouteRenderMetadata(SAMPLE_ROUTE)

    expect(metadata).not.toBeNull()
    expect(metadata?.version).toBe(1)
    expect(metadata?.bounds).toEqual({
      minLat: 36,
      maxLat: 36.003,
      minLng: 127,
      maxLng: 127.009,
    })
    expect(metadata?.hoverProfile).toHaveLength(4)
    expect(metadata?.slopeSegments.length).toBeGreaterThan(0)
  })

  it('returns null for missing route input', () => {
    expect(buildRouteRenderMetadata(null)).toBeNull()
  })
})

describe('normalizeRouteRenderMetadata', () => {
  it('accepts persisted metadata payloads and keeps only valid numeric entries', () => {
    const metadata = normalizeRouteRenderMetadata({
      version: 1,
      bounds: { minLat: 36, maxLat: 36.1, minLng: 127, maxLng: 127.1 },
      hoverProfile: [
        { distanceKm: 0, elevationM: 100, lat: 36, lng: 127 },
        { distanceKm: 1.23, elevationM: 120, lat: 36.01, lng: 127.02 },
      ],
      slopeSegments: [
        { startKm: 0, endKm: 1.23, slopePct: 3.6 },
      ],
    })

    expect(metadata).toMatchObject({
      version: 1,
      bounds: { minLat: 36, maxLat: 36.1, minLng: 127, maxLng: 127.1 },
    })
    expect(getElevationProfileFromMetadata(metadata)).toEqual([
      { distanceKm: 0, elevationM: 100 },
      { distanceKm: 1.23, elevationM: 120 },
    ])
  })

  it('rejects incomplete payloads', () => {
    expect(normalizeRouteRenderMetadata({ version: 1, hoverProfile: [] })).toBeNull()
    expect(normalizeRouteRenderMetadata(null)).toBeNull()
  })
})
