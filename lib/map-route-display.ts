import type { CourseMapItem, RouteGeoJSON } from '@/types/course'

export function mergeSelectedAndBackgroundRoutes({
  selectedCourseId,
  selectedCourseRouteGeoJSON,
  backgroundCourses,
}: {
  selectedCourseId: string | null | undefined
  selectedCourseRouteGeoJSON: RouteGeoJSON | null | undefined
  backgroundCourses: CourseMapItem[]
}): CourseMapItem[] {
  const selectedCourse =
    selectedCourseId && selectedCourseRouteGeoJSON
      ? [{ id: selectedCourseId, route_geojson: selectedCourseRouteGeoJSON }]
      : []

  const dedupedBackground = selectedCourseRouteGeoJSON
    ? backgroundCourses.filter((course) => course.id !== selectedCourseId)
    : backgroundCourses

  return [...selectedCourse, ...dedupedBackground]
}
