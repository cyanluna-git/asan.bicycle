import { describe, expect, it } from 'vitest'
import {
  buildRoutePreview,
  getRoutePreviewViewport,
  normalizeRoutePreviewPoints,
} from '@/lib/course-route-preview'
import type { RouteGeoJSON, RoutePreviewPoint } from '@/types/course'

// ---------------------------------------------------------------------------
// buildRoutePreview
// ---------------------------------------------------------------------------

describe('buildRoutePreview', () => {
  it('samples large line strings into a bounded preview set', () => {
    const coordinates = Array.from({ length: 120 }, (_, index) => [127 + index * 0.001, 36 + index * 0.001])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        },
      ],
    }

    const preview = buildRoutePreview(route, 24)

    expect(preview).toHaveLength(24)
    expect(preview[0]).toEqual({ lng: 127, lat: 36 })
    expect(preview[23]).toEqual({ lng: 127.119, lat: 36.119 })
  })

  it('returns empty array for null input', () => {
    expect(buildRoutePreview(null)).toEqual([])
  })

  it('preserves first and last points when sampling', () => {
    const coordinates = Array.from({ length: 200 }, (_, index) => [127 + index * 0.001, 36 + index * 0.001])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        },
      ],
    }

    const preview = buildRoutePreview(route)
    expect(preview[0]).toEqual({ lng: 127, lat: 36 })
    expect(preview[preview.length - 1]).toEqual({ lng: 127.199, lat: 36.199 })
    expect(preview.length).toBeLessThanOrEqual(48)
  })

  it('returns all points when count is at or below maxPoints', () => {
    const coordinates = Array.from({ length: 10 }, (_, i) => [127 + i * 0.01, 36 + i * 0.01])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        },
      ],
    }

    const preview = buildRoutePreview(route, 48)
    expect(preview).toHaveLength(10)
  })

  it('returns exactly maxPoints when input exceeds threshold', () => {
    const coordinates = Array.from({ length: 49 }, (_, i) => [127 + i * 0.001, 36 + i * 0.001])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        },
      ],
    }

    // Default maxPoints is 48; 49 points should be sampled down to 48
    const preview = buildRoutePreview(route)
    expect(preview).toHaveLength(48)
  })

  it('handles empty features array', () => {
    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [],
    }

    const preview = buildRoutePreview(route)
    expect(preview).toEqual([])
  })

  it('skips non-LineString geometry types', () => {
    const route = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [127.0, 36.0] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.0, 36.0],
              [127.1, 36.1],
            ],
          },
        },
      ],
    } as unknown as RouteGeoJSON

    const preview = buildRoutePreview(route)
    expect(preview).toHaveLength(2)
    expect(preview[0]).toEqual({ lng: 127.0, lat: 36.0 })
  })

  it('concatenates coordinates from multiple LineString features', () => {
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
              [127.01, 36.01],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [127.02, 36.02],
              [127.03, 36.03],
            ],
          },
        },
      ],
    }

    const preview = buildRoutePreview(route)
    expect(preview).toHaveLength(4)
    expect(preview[0]).toEqual({ lng: 127.0, lat: 36.0 })
    expect(preview[3]).toEqual({ lng: 127.03, lat: 36.03 })
  })

  it('uses default maxPoints of 48', () => {
    const coordinates = Array.from({ length: 100 }, (_, i) => [127 + i * 0.001, 36 + i * 0.001])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        },
      ],
    }

    const preview = buildRoutePreview(route)
    expect(preview).toHaveLength(48)
  })
})

// ---------------------------------------------------------------------------
// normalizeRoutePreviewPoints
// ---------------------------------------------------------------------------

describe('normalizeRoutePreviewPoints', () => {
  it('normalizes preview points into svg-safe coordinates', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.1, lng: 127.1 },
      { lat: 36.2, lng: 127.2 },
      { lat: 36.15, lng: 127.25 },
    ])

    expect(points).toEqual([
      '8.00,78.00',
      '64.00,22.00',
      '92.00,50.00',
    ])
  })

  it('returns empty array for empty input', () => {
    expect(normalizeRoutePreviewPoints([])).toEqual([])
  })

  it('returns empty array for single-point input', () => {
    expect(normalizeRoutePreviewPoints([{ lat: 36.1, lng: 127.1 }])).toEqual([])
  })

  it('normalized points fit inside SVG viewBox 0-100 with insets', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.1, lng: 127.1 },
    ])

    expect(points).toHaveLength(2)
    for (const pt of points) {
      const [x, y] = pt.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x).toBeLessThanOrEqual(92)
      expect(y).toBeGreaterThanOrEqual(8)
      expect(y).toBeLessThanOrEqual(92)
    }
  })

  it('normalized output is joinable as SVG polyline points string', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.1, lng: 127.1 },
      { lat: 36.05, lng: 127.15 },
    ])

    const polylinePoints = points.join(' ')
    // Each point is "x,y" so joined string has spaces between pairs
    expect(polylinePoints).toMatch(/^\d+\.\d+,\d+\.\d+( \d+\.\d+,\d+\.\d+)+$/)
  })

  it('handles two identical points without division errors', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.0, lng: 127.0 },
    ])

    // Should produce valid output (the epsilon prevents division by zero)
    expect(points).toHaveLength(2)
    for (const pt of points) {
      const [x, y] = pt.split(',').map(Number)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })

  it('correctly flips Y axis (higher lat = lower y in SVG)', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 }, // lower lat => higher y
      { lat: 36.1, lng: 127.0 }, // higher lat => lower y
    ])

    const [, y0] = points[0].split(',').map(Number)
    const [, y1] = points[1].split(',').map(Number)

    // The point with higher latitude should have a smaller y coordinate
    expect(y1).toBeLessThan(y0)
  })

  it('handles wide routes (lng span > lat span) with proper centering', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.0, lng: 127.5 }, // wide east-west spread
    ])

    expect(points).toHaveLength(2)
    // Since lat span is ~0, the route should be vertically centered at y=50
    const [, y0] = points[0].split(',').map(Number)
    const [, y1] = points[1].split(',').map(Number)
    expect(y0).toBeCloseTo(50, 0)
    expect(y1).toBeCloseTo(50, 0)
  })

  it('handles tall routes (lat span > lng span) with proper centering', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.5, lng: 127.0 }, // tall north-south spread
    ])

    expect(points).toHaveLength(2)
    // Since lng span is ~0, the route should be horizontally centered at x=50
    const [x0] = points[0].split(',').map(Number)
    const [x1] = points[1].split(',').map(Number)
    expect(x0).toBeCloseTo(50, 0)
    expect(x1).toBeCloseTo(50, 0)
  })

  it('all points stay within inset bounds for many-point routes', () => {
    // Generate a complex route with many points
    const rawPoints: RoutePreviewPoint[] = Array.from({ length: 50 }, (_, i) => ({
      lat: 36.0 + Math.sin(i * 0.3) * 0.1,
      lng: 127.0 + Math.cos(i * 0.3) * 0.15,
    }))

    const normalized = normalizeRoutePreviewPoints(rawPoints)

    expect(normalized).toHaveLength(50)
    for (const pt of normalized) {
      const [x, y] = pt.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x).toBeLessThanOrEqual(92)
      expect(y).toBeGreaterThanOrEqual(8)
      expect(y).toBeLessThanOrEqual(92)
    }
  })

  it('output format is always "X.XX,Y.YY" with two decimal places', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.123456, lng: 127.654321 },
    ])

    for (const pt of points) {
      expect(pt).toMatch(/^\d+\.\d{2},\d+\.\d{2}$/)
    }
  })

  it('extreme bounding box still produces valid coordinates', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 0.0, lng: 0.0 },
      { lat: 90.0, lng: 180.0 },
    ])

    expect(points).toHaveLength(2)
    for (const pt of points) {
      const [x, y] = pt.split(',').map(Number)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x).toBeLessThanOrEqual(92)
      expect(y).toBeGreaterThanOrEqual(8)
      expect(y).toBeLessThanOrEqual(92)
    }
  })
})

// ---------------------------------------------------------------------------
// getRoutePreviewViewport
// ---------------------------------------------------------------------------

describe('getRoutePreviewViewport', () => {
  it('returns default center and level for empty points', () => {
    const vp = getRoutePreviewViewport([])
    expect(vp.center).toEqual({ lat: 36.7797, lng: 127.004 })
    expect(vp.level).toBe(10)
  })

  it('centers on the single point for one-point input', () => {
    const vp = getRoutePreviewViewport([{ lat: 36.5, lng: 127.5 }])
    expect(vp.center.lat).toBeCloseTo(36.5)
    expect(vp.center.lng).toBeCloseTo(127.5)
  })

  it('computes center as midpoint of bounding box', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 37.0, lng: 128.0 },
    ])

    expect(vp.center.lat).toBeCloseTo(36.5)
    expect(vp.center.lng).toBeCloseTo(127.5)
  })

  it('returns level 11 for very small spans (< 0.003)', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.002, lng: 127.002 },
    ])
    expect(vp.level).toBe(11)
  })

  it('returns level 10 for spans between 0.003 and 0.006', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.005, lng: 127.005 },
    ])
    expect(vp.level).toBe(10)
  })

  it('returns level 9 for spans between 0.006 and 0.01', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.008, lng: 127.008 },
    ])
    expect(vp.level).toBe(9)
  })

  it('returns level 8 for spans between 0.01 and 0.02', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.015, lng: 127.015 },
    ])
    expect(vp.level).toBe(8)
  })

  it('returns level 7 for spans >= 0.02', () => {
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.1, lng: 127.1 },
    ])
    expect(vp.level).toBe(7)
  })

  it('uses max of lat/lng span for level calculation', () => {
    // lat span is tiny, but lng span is large
    const vp = getRoutePreviewViewport([
      { lat: 36.0, lng: 127.0 },
      { lat: 36.001, lng: 127.05 },
    ])
    expect(vp.level).toBe(7) // maxSpan = 0.05 >= 0.02
  })
})

// ---------------------------------------------------------------------------
// browse query field selection
// ---------------------------------------------------------------------------

describe('browse query fields', () => {
  it('COURSE_BROWSE_FIELDS selects route_preview_points, not route_geojson', async () => {
    // Read the source file directly to verify the field constants without
    // triggering Supabase initialization (which requires env vars)
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sourcePath = path.resolve(__dirname, '..', 'lib', 'course-browse.ts')
    const source = fs.readFileSync(sourcePath, 'utf-8')

    // Extract the COURSE_BROWSE_FIELDS constant value
    const fieldsMatch = source.match(/COURSE_BROWSE_FIELDS\s*=\s*'([^']+)'/)
    expect(fieldsMatch).toBeTruthy()
    const fields = fieldsMatch![1]

    expect(fields).toContain('route_preview_points')
    expect(fields).not.toContain('route_geojson')
  })

  it('COURSE_BROWSE_FIELDS_FALLBACK selects route_preview_points, not route_geojson', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sourcePath = path.resolve(__dirname, '..', 'lib', 'course-browse.ts')
    const source = fs.readFileSync(sourcePath, 'utf-8')

    const fallbackMatch = source.match(/COURSE_BROWSE_FIELDS_FALLBACK\s*=\s*'([^']+)'/)
    expect(fallbackMatch).toBeTruthy()
    const fallbackFields = fallbackMatch![1]

    expect(fallbackFields).toContain('route_preview_points')
    expect(fallbackFields).not.toContain('route_geojson')
  })
})

// ---------------------------------------------------------------------------
// end-to-end: buildRoutePreview -> normalizeRoutePreviewPoints pipeline
// ---------------------------------------------------------------------------

describe('route preview pipeline (build -> normalize)', () => {
  it('produces valid SVG polyline points from raw GeoJSON', () => {
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
              [127.05, 36.03],
              [127.1, 36.01],
              [127.15, 36.06],
              [127.2, 36.02],
            ],
          },
        },
      ],
    }

    const preview = buildRoutePreview(route)
    const normalized = normalizeRoutePreviewPoints(preview)
    const polylineStr = normalized.join(' ')

    // Should produce a valid polyline points string
    expect(normalized.length).toBe(5)
    expect(polylineStr).toMatch(/^\d+\.\d+,\d+\.\d+( \d+\.\d+,\d+\.\d+)+$/)

    // All points should be within SVG viewBox bounds
    for (const pt of normalized) {
      const [x, y] = pt.split(',').map(Number)
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x).toBeLessThanOrEqual(92)
      expect(y).toBeGreaterThanOrEqual(8)
      expect(y).toBeLessThanOrEqual(92)
    }
  })

  it('handles the sampling + normalize pipeline for large routes', () => {
    const coordinates = Array.from({ length: 500 }, (_, i) => [
      127.0 + Math.cos(i * 0.05) * 0.1,
      36.0 + Math.sin(i * 0.05) * 0.1,
    ])

    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        },
      ],
    }

    const preview = buildRoutePreview(route)
    expect(preview.length).toBeLessThanOrEqual(48)

    const normalized = normalizeRoutePreviewPoints(preview)
    expect(normalized.length).toBe(preview.length)

    // All SVG coordinates valid
    for (const pt of normalized) {
      const [x, y] = pt.split(',').map(Number)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(8)
      expect(x).toBeLessThanOrEqual(92)
      expect(y).toBeGreaterThanOrEqual(8)
      expect(y).toBeLessThanOrEqual(92)
    }
  })

  it('pipeline returns empty for null geojson input', () => {
    const preview = buildRoutePreview(null)
    const normalized = normalizeRoutePreviewPoints(preview)
    expect(normalized).toEqual([])
  })
})
