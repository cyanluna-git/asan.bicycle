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

  it('treats negative slopes (any magnitude) as descent', () => {
    expect(classifySlopeBand(-0.0001)).toBe('descent')
    expect(classifySlopeBand(-0.5)).toBe('descent')
    expect(classifySlopeBand(-50)).toBe('descent')
  })

  it('classifies exactly 0% as flat (lower flat boundary, inclusive)', () => {
    expect(classifySlopeBand(0)).toBe('flat')
  })

  it('classifies exactly 1% as flat (flat upper boundary, inclusive)', () => {
    // implementation: slopePct <= 1 → flat
    expect(classifySlopeBand(1)).toBe('flat')
  })

  it('classifies just above 1% as gentle (flat upper boundary, exclusive)', () => {
    expect(classifySlopeBand(1.0001)).toBe('gentle')
  })

  it('classifies exactly 5% as gentle (gentle upper boundary, inclusive)', () => {
    // implementation: slopePct <= 5 → gentle
    expect(classifySlopeBand(5)).toBe('gentle')
  })

  it('classifies just above 5% as moderate (gentle upper boundary, exclusive)', () => {
    expect(classifySlopeBand(5.0001)).toBe('moderate')
  })

  it('classifies exactly 8% as moderate (moderate upper boundary, inclusive)', () => {
    // implementation: slopePct <= 8 → moderate
    expect(classifySlopeBand(8)).toBe('moderate')
  })

  it('classifies just above 8% as steep (moderate upper boundary, exclusive)', () => {
    expect(classifySlopeBand(8.0001)).toBe('steep')
  })

  it('classifies exactly 12% as steep (steep upper boundary, inclusive)', () => {
    // implementation: slopePct <= 12 → steep
    expect(classifySlopeBand(12)).toBe('steep')
  })

  it('classifies just above 12% as extreme (steep upper boundary, exclusive)', () => {
    expect(classifySlopeBand(12.0001)).toBe('extreme')
  })
})

describe('getSlopeBandMeta', () => {
  it('returns the meta entry matching classifySlopeBand for the same input', () => {
    const samples = [-5, 0, 1, 5, 8, 12, 20]
    for (const slope of samples) {
      const meta = getSlopeBandMeta(slope)
      expect(meta.key).toBe(classifySlopeBand(slope))
      expect(typeof meta.color).toBe('string')
      expect(meta.color.startsWith('#')).toBe(true)
    }
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

    // Both raw segments fall into the same `gentle` band after smoothing,
    // so the implementation groups them into a single continuous polyline.
    expect(segments).toHaveLength(1)
    expect(segments[0].band).toBe('gentle')
    expect(segments[0].path).toEqual([
      { lat: 36, lng: 127 },
      { lat: 36, lng: 127.001 },
      { lat: 36, lng: 127.002 },
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
