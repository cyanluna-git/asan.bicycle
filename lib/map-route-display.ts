import type { CourseMapItem, RouteGeoJSON, RoutePreviewPoint, RouteRenderMetadata } from '@/types/course'

export function mergeSelectedAndBackgroundRoutes({
  selectedCourseId,
  selectedCourseRouteGeoJSON,
  selectedCourseRoutePreviewPoints,
  selectedCourseRouteRenderMetadata,
  backgroundCourses,
}: {
  selectedCourseId: string | null | undefined
  selectedCourseRouteGeoJSON: RouteGeoJSON | null | undefined
  selectedCourseRoutePreviewPoints?: RoutePreviewPoint[] | null | undefined
  selectedCourseRouteRenderMetadata?: RouteRenderMetadata | null | undefined
  backgroundCourses: CourseMapItem[]
}): CourseMapItem[] {
  const selectedCourse =
    selectedCourseId && selectedCourseRouteGeoJSON
      ? [{
          id: selectedCourseId,
          route_geojson: selectedCourseRouteGeoJSON,
          route_preview_points: selectedCourseRoutePreviewPoints ?? null,
          route_render_metadata: selectedCourseRouteRenderMetadata ?? null,
        }]
      : []

  const dedupedBackground = selectedCourseRouteGeoJSON
    ? backgroundCourses.filter((course) => course.id !== selectedCourseId)
    : backgroundCourses

  return [...selectedCourse, ...dedupedBackground]
}
