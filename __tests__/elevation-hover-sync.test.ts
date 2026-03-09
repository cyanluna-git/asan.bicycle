import { describe, expect, it } from 'vitest'
import {
  buildRouteHoverProfile,
  findNearestRouteHoverPoint,
} from '@/lib/elevation-hover-sync'
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
          [127.005, 36.0, 125],
          [127.01, 36.0, 150],
        ],
      },
    },
  ],
}

describe('buildRouteHoverProfile', () => {
  it('builds cumulative hover points with coordinates and elevation', () => {
    const profile = buildRouteHoverProfile(SAMPLE_ROUTE)

    expect(profile).toHaveLength(3)
    expect(profile[0]).toMatchObject({
      distanceKm: 0,
      elevationM: 100,
      lat: 36,
      lng: 127,
    })
    expect(profile[1].distanceKm).toBeGreaterThan(0)
    expect(profile[2].distanceKm).toBeGreaterThan(profile[1].distanceKm)
    expect(profile[2]).toMatchObject({
      elevationM: 150,
      lat: 36,
      lng: 127.01,
    })
  })

  it('skips points without elevation and returns an empty profile for null input', () => {
    expect(buildRouteHoverProfile(null)).toEqual([])

    const profile = buildRouteHoverProfile({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.0, 36.0],
              [127.005, 36.0, 120],
            ],
          },
        },
      ],
    })

    expect(profile).toHaveLength(1)
    expect(profile[0]).toMatchObject({
      elevationM: 120,
      lat: 36,
      lng: 127.005,
    })
    expect(profile[0].distanceKm).toBeGreaterThan(0)
  })
})

describe('findNearestRouteHoverPoint', () => {
  it('returns the nearest point for a hovered distance', () => {
    const profile = buildRouteHoverProfile(SAMPLE_ROUTE)

    expect(findNearestRouteHoverPoint(profile, 0.42)).toEqual(profile[1])
    expect(findNearestRouteHoverPoint(profile, 1.5)).toEqual(profile[2])
  })

  it('returns null for invalid hover input', () => {
    const profile = buildRouteHoverProfile(SAMPLE_ROUTE)

    expect(findNearestRouteHoverPoint([], 0.2)).toBeNull()
    expect(findNearestRouteHoverPoint(profile, null)).toBeNull()
    expect(findNearestRouteHoverPoint(profile, Number.NaN)).toBeNull()
  })
})
