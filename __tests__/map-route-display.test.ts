import { describe, expect, it } from 'vitest'
import { mergeSelectedAndBackgroundRoutes } from '@/lib/map-route-display'
import type { CourseMapItem, RouteGeoJSON } from '@/types/course'

const ROUTE: RouteGeoJSON = {
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
  ],
}

function makeCourse(id: string): CourseMapItem {
  return {
    id,
    route_geojson: ROUTE,
    route_preview_points: null,
    route_render_metadata: null,
  }
}

describe('mergeSelectedAndBackgroundRoutes', () => {
  it('puts the selected course first and removes the duplicate background route', () => {
    const result = mergeSelectedAndBackgroundRoutes({
      selectedCourseId: 'course-2',
      selectedCourseRouteGeoJSON: ROUTE,
      selectedCourseRoutePreviewPoints: [{ lat: 36, lng: 127 }],
      selectedCourseRouteRenderMetadata: {
        version: 1,
        bounds: { minLat: 36, maxLat: 36.01, minLng: 127, maxLng: 127.01 },
        hoverProfile: [],
        slopeSegments: [],
      },
      backgroundCourses: [makeCourse('course-1'), makeCourse('course-2'), makeCourse('course-3')],
    })

    expect(result.map((course) => course.id)).toEqual(['course-2', 'course-1', 'course-3'])
    expect(result[0].route_preview_points).toEqual([{ lat: 36, lng: 127 }])
  })

  it('returns only background courses when no selected route geojson is available', () => {
    const result = mergeSelectedAndBackgroundRoutes({
      selectedCourseId: 'course-2',
      selectedCourseRouteGeoJSON: null,
      backgroundCourses: [makeCourse('course-1'), makeCourse('course-2')],
    })

    expect(result.map((course) => course.id)).toEqual(['course-1', 'course-2'])
  })
})
