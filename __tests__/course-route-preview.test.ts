import { describe, expect, it } from 'vitest'
import {
  buildRoutePreview,
  normalizeRoutePreviewPoints,
} from '@/lib/course-route-preview'
import type { RouteGeoJSON } from '@/types/course'

describe('course route preview helpers', () => {
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

  it('normalizes preview points into svg-safe coordinates', () => {
    const points = normalizeRoutePreviewPoints([
      { lat: 36.1, lng: 127.1 },
      { lat: 36.2, lng: 127.2 },
      { lat: 36.15, lng: 127.25 },
    ])

    expect(points).toEqual([
      '8.00,92.00',
      '64.00,8.00',
      '92.00,50.00',
    ])
  })

  it('returns an empty preview for empty or single-point inputs', () => {
    expect(buildRoutePreview(null)).toEqual([])
    expect(normalizeRoutePreviewPoints([{ lat: 36.1, lng: 127.1 }])).toEqual([])
  })
})
