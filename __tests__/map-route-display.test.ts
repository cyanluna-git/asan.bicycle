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
  }
}

describe('mergeSelectedAndBackgroundRoutes', () => {
  it('puts the selected course first and removes the duplicate background route', () => {
    const result = mergeSelectedAndBackgroundRoutes({
      selectedCourseId: 'course-2',
      selectedCourseRouteGeoJSON: ROUTE,
      backgroundCourses: [makeCourse('course-1'), makeCourse('course-2'), makeCourse('course-3')],
    })

    expect(result.map((course) => course.id)).toEqual(['course-2', 'course-1', 'course-3'])
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
