import { describe, expect, it } from 'vitest'
import {
  buildSlopeDistanceSegments,
  buildSlopeGradientStops,
  buildSlopePolylineSegments,
  classifySlopeBand,
  getSlopeBandMeta,
} from '@/lib/slope-visualization'
import type { RouteGeoJSON } from '@/types/course'

describe('classifySlopeBand', () => {
  it('maps slope thresholds to the expected visual bands', () => {
    expect(classifySlopeBand(-3)).toBe('descent')
    expect(classifySlopeBand(0.8)).toBe('flat')
    expect(classifySlopeBand(3.2)).toBe('gentle')
    expect(classifySlopeBand(6.5)).toBe('moderate')
    expect(classifySlopeBand(10)).toBe('steep')
    expect(classifySlopeBand(14)).toBe('extreme')
  })
})

describe('buildSlopeGradientStops', () => {
  it('builds hard color stops across the elevation profile distance range', () => {
    const stops = buildSlopeGradientStops([
      { distanceKm: 0, elevationM: 100 },
      { distanceKm: 0.5, elevationM: 102 },
      { distanceKm: 1, elevationM: 142 },
    ])

    expect(stops.length).toBeGreaterThan(3)
    expect(stops[0]).toMatchObject({
      offset: '0.00%',
      color: expect.any(String),
    })
    expect(stops.at(-1)).toMatchObject({
      offset: '100%',
      color: expect.any(String),
    })
  })
})

describe('buildSlopeDistanceSegments', () => {
  it('returns distance-based colored segments for compact strip rendering', () => {
    const segments = buildSlopeDistanceSegments([
      { distanceKm: 0, elevationM: 100 },
      { distanceKm: 0.5, elevationM: 100.5 },
      { distanceKm: 1, elevationM: 110.5 },
    ])

    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({
      startKm: 0,
      endKm: 0.5,
      band: 'gentle',
    })
    expect(segments[1]).toMatchObject({
      startKm: 0.5,
      endKm: 1,
      band: 'gentle',
    })
  })
})

describe('buildSlopePolylineSegments', () => {
  it('builds colored polyline segments from route elevation data', () => {
    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.0, 36.0, 100],
              [127.001, 36.0, 101],
              [127.002, 36.0, 102],
            ],
          },
        },
      ],
    }

    const segments = buildSlopePolylineSegments(route)

    expect(segments).toHaveLength(2)
    expect(segments[0].band).toBe('gentle')
    expect(segments[0].path).toEqual([
      { lat: 36, lng: 127 },
      { lat: 36, lng: 127.001 },
    ])
    expect(segments[0].color).toBe(getSlopeBandMeta(segments[0].slopePct).color)
  })

  it('skips coordinates without elevation', () => {
    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.0, 36.0],
              [127.001, 36.0, 101],
              [127.002, 36.0, 102],
            ],
          },
        },
      ],
    }

    const segments = buildSlopePolylineSegments(route)
    expect(segments).toHaveLength(1)
  })
})
