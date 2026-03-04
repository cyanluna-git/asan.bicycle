import { Sidebar } from '@/components/layout/sidebar'
import KakaoMap from '@/components/map/kakao-map'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import { supabase } from '@/lib/supabase'
import { parseFilterParams, countActiveFilters } from '@/lib/filter'
import type { CourseListItem, CourseMapItem, RouteGeoJSON } from '@/types/course'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilterParams(params)
  const hasActiveFilters = countActiveFilters(filters) > 0

  // Fetch start_points for the dropdown
  const { data: startPoints, error: startPointsError } = await supabase
    .from('start_points')
    .select('id, name')
    .order('name')
  if (startPointsError) console.error('[page] supabase error:', startPointsError)

  const startPointList = (startPoints ?? []).map((sp) => ({
    id: sp.id,
    name: sp.name,
  }))

  // Fetch unique theme values from courses
  // Supabase JS v2 doesn't support SELECT DISTINCT; deduplication done in JS
  const { data: themesRaw, error: themesError } = await supabase
    .from('courses')
    .select('theme')
    .not('theme', 'is', null)
    .order('theme')
  if (themesError) console.error('[page] supabase error:', themesError)

  const themeList = [
    ...new Set(
      (themesRaw ?? [])
        .map((c) => c.theme)
        .filter((t): t is string => t != null && t.length > 0),
    ),
  ]

  // Build filtered courses query
  let query = supabase
    .from('courses')
    .select('id, title, difficulty, distance_km, elevation_gain_m, theme, tags, route_geojson')
    .order('created_at', { ascending: false })

  if (filters.startPoint) {
    query = query.eq('start_point_id', filters.startPoint)
  }

  if (filters.difficulty.length > 0) {
    query = query.in('difficulty', filters.difficulty)
  }

  if (filters.distance) {
    if (filters.distance === 'short') query = query.lte('distance_km', 50)
    else if (filters.distance === 'medium') query = query.lte('distance_km', 80)
    else if (filters.distance === 'long') query = query.lte('distance_km', 120)
    else if (filters.distance === 'ultralong')
      query = query.gt('distance_km', 120)
  }

  // theme: scalar text column — use .in() for OR logic.
  // AND is impossible on a scalar column; each course has at most one theme value.
  if (filters.themes.length > 0) {
    query = query.in('theme', filters.themes)
  }

  const { data: courses, error: coursesError } = await query
  if (coursesError) console.error('[page] supabase error:', coursesError)

  const courseList: CourseListItem[] = (courses ?? []).map(
    ({ id, title, difficulty, distance_km, elevation_gain_m, theme, tags }) => ({
      id, title, difficulty, distance_km, elevation_gain_m, theme, tags,
    }),
  )

  // Build lightweight route data for the map component
  const courseRoutes: CourseMapItem[] = (courses ?? []).map((c) => ({
    id: c.id,
    route_geojson: (c.route_geojson as RouteGeoJSON) ?? null,
  }))

  // Selected course from URL ?courseId= param
  const selectedCourseId =
    typeof params.courseId === 'string' ? params.courseId : null

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar
        courses={courseList}
        startPoints={startPointList}
        themes={themeList}
        hasActiveFilters={hasActiveFilters}
      />
      <main className="flex-1 relative flex">
        <KakaoMap courses={courseRoutes} selectedCourseId={selectedCourseId} />
        <BottomSheet
          courses={courseList}
          startPoints={startPointList}
          themes={themeList}
          hasActiveFilters={hasActiveFilters}
        />
      </main>
    </div>
  )
}
