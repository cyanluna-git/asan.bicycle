import { ExploreShell } from '@/components/explore/explore-shell'
import { hydrateCourseReviews } from '@/lib/course-reviews'
import { hydrateUploaderNames } from '@/lib/course-uploader'
import { supabase } from '@/lib/supabase'
import { parseFilterParams, countActiveFilters } from '@/lib/filter'
import type {
  CourseDetail,
  CourseListItem,
  CourseMapItem,
  CourseReview,
  CourseReviewStats,
  PoiMapItem,
  RouteGeoJSON,
  UphillSegment,
} from '@/types/course'

const COURSE_LIST_FIELDS = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, route_geojson, created_by'
const COURSE_LIST_FIELDS_WITH_UPLOADER = `${COURSE_LIST_FIELDS}, uploader_name, uploader_emoji`
const COURSE_DETAIL_FIELDS = 'id, title, description, difficulty, distance_km, elevation_gain_m, gpx_url, theme, tags, route_geojson, created_by, start_point_id'
const COURSE_DETAIL_FIELDS_WITH_UPLOADER = `${COURSE_DETAIL_FIELDS}, uploader_name, uploader_emoji`

type CourseListRow = {
  id: string
  title: string
  difficulty: CourseListItem['difficulty']
  distance_km: number
  elevation_gain_m: number
  theme: string | null
  tags: string[]
  route_geojson: RouteGeoJSON | null
  created_by: string | null
  uploader_name?: string | null
  uploader_emoji?: string | null
}

type CourseDetailRow = {
  id: string
  title: string
  description: string | null
  difficulty: CourseDetail['difficulty']
  distance_km: number
  elevation_gain_m: number
  gpx_url: string | null
  theme: string | null
  tags: string[]
  route_geojson: RouteGeoJSON | null
  created_by: string | null
  start_point_id: string | null
  uploader_name?: string | null
  uploader_emoji?: string | null
}

type CourseReviewRow = {
  id: string
  course_id: string
  user_id: string
  rating: number
  content: string
  ridden_at: string | null
  perceived_difficulty: CourseReview['perceived_difficulty']
  condition_note: string | null
  created_at: string
  updated_at: string
  author_name?: string | null
  author_emoji?: string | null
}

function buildCoursesQuery(
  filters: ReturnType<typeof parseFilterParams>,
  selectFields: string,
) {
  let query = supabase
    .from('courses')
    .select(selectFields)
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
    else if (filters.distance === 'ultralong') query = query.gt('distance_km', 120)
  }

  if (filters.themes.length > 0) {
    query = query.in('theme', filters.themes)
  }

  return query
}

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
  if (startPointsError) console.error('[page] start_points error:', startPointsError.message, startPointsError.details)

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
  if (themesError) console.error('[page] themes error:', themesError.message, themesError.details)

  const themeList = [
    ...new Set(
      (themesRaw ?? [])
        .map((c) => c.theme)
        .filter((t): t is string => t != null && t.length > 0),
    ),
  ]

  let { data: courses, error: coursesError } = await buildCoursesQuery(
    filters,
    COURSE_LIST_FIELDS_WITH_UPLOADER,
  )
  if (coursesError && /(uploader_name|uploader_emoji)/i.test(coursesError.message)) {
    const fallback = await buildCoursesQuery(filters, COURSE_LIST_FIELDS)
    courses = fallback.data
    coursesError = fallback.error
  }
  if (coursesError) console.error('[page] courses error:', coursesError.message, coursesError.details)

  const courseRows = await hydrateUploaderNames(
    ((courses ?? []) as unknown) as CourseListRow[],
  )

  const courseList: CourseListItem[] = courseRows.map(
    ({ id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, uploader_name, uploader_emoji }) => ({
      id,
      title,
      difficulty,
      distance_km,
      elevation_gain_m,
      theme,
      tags,
      created_by,
      uploader_name: uploader_name ?? null,
      uploader_emoji: uploader_emoji ?? null,
    }),
  )

  // Build lightweight route data for the map component
  const courseRoutes: CourseMapItem[] = courseRows.map((c) => ({
    id: c.id,
    route_geojson: (c.route_geojson as RouteGeoJSON) ?? null,
  }))

  // Selected course from URL ?courseId= param
  const selectedCourseId =
    typeof params.courseId === 'string' ? params.courseId : null

  let selectedCourseData: CourseDetailRow | null = null
  if (selectedCourseId) {
    let selectedCourseQuery = await supabase
        .from('courses')
        .select(COURSE_DETAIL_FIELDS_WITH_UPLOADER)
        .eq('id', selectedCourseId)
        .single()
    if (selectedCourseQuery.error && /(uploader_name|uploader_emoji)/i.test(selectedCourseQuery.error.message)) {
      selectedCourseQuery = await supabase
        .from('courses')
        .select(COURSE_DETAIL_FIELDS)
        .eq('id', selectedCourseId)
        .single()
    }
    const rawSelectedCourse = (selectedCourseQuery.data as unknown) as CourseDetailRow | null

    selectedCourseData = rawSelectedCourse
      ? {
          ...rawSelectedCourse,
          uploader_name: rawSelectedCourse.uploader_name ?? null,
          uploader_emoji: rawSelectedCourse.uploader_emoji ?? null,
        }
      : null

    if (selectedCourseData) {
      ;[selectedCourseData] = await hydrateUploaderNames([selectedCourseData])
    }
  }

  const selectedCourse: CourseDetail | null = selectedCourseData
    ? {
        ...selectedCourseData,
        uploader_name: selectedCourseData.uploader_name ?? null,
        uploader_emoji: selectedCourseData.uploader_emoji ?? null,
        route_geojson: (selectedCourseData.route_geojson as RouteGeoJSON) ?? null,
      }
    : null

  // Fetch uphill segments for the selected course
  const { data: uphillRaw } = selectedCourseId
    ? await supabase
        .from('uphill_segments')
        .select('id, course_id, name, start_km, end_km, created_at')
        .eq('course_id', selectedCourseId)
        .order('start_km')
    : { data: [] }

  const uphillSegments: UphillSegment[] = (uphillRaw ?? []) as UphillSegment[]

  const { data: reviewStatsRaw } = selectedCourseId
    ? await supabase
        .from('course_review_stats')
        .select('course_id, review_count, avg_rating')
        .eq('course_id', selectedCourseId)
        .maybeSingle()
    : { data: null }

  const { data: reviewRowsRaw } = selectedCourseId
      ? await supabase
        .from('course_reviews_public')
        .select('id, course_id, user_id, rating, content, ridden_at, perceived_difficulty, condition_note, created_at, updated_at, author_name, author_emoji')
        .eq('course_id', selectedCourseId)
        .order('created_at', { ascending: false })
    : { data: [] }

  const reviewRows = await hydrateCourseReviews(
    ((reviewRowsRaw ?? []) as unknown) as CourseReviewRow[],
  )

  const reviews: CourseReview[] = reviewRows.map((review) => ({
    ...review,
    author_name: review.author_name ?? null,
    author_emoji: review.author_emoji ?? null,
  }))

  const reviewStats: CourseReviewStats | null = reviewStatsRaw
    ? {
        review_count: Number(reviewStatsRaw.review_count ?? 0),
        avg_rating: typeof reviewStatsRaw.avg_rating === 'number'
          ? reviewStatsRaw.avg_rating
          : reviewStatsRaw.avg_rating == null
            ? null
            : Number(reviewStatsRaw.avg_rating),
      }
    : null

  // Fetch POIs only for the selected course (only needed when a course is selected)
  const { data: poisRaw } = selectedCourseId
    ? await supabase
        .from('pois_with_coords')
        .select('id, course_id, name, category, description, photo_url, lat, lng')
        .eq('course_id', selectedCourseId)
        .order('category')
    : { data: [] }

  const pois: PoiMapItem[] = (poisRaw ?? []) as PoiMapItem[]

  return (
    <ExploreShell
      courses={courseList}
      courseRoutes={courseRoutes}
      startPoints={startPointList}
      themes={themeList}
      hasActiveFilters={hasActiveFilters}
      selectedCourseId={selectedCourseId}
      selectedCourse={selectedCourse}
      pois={pois}
      uphillSegments={uphillSegments}
      reviews={reviews}
      reviewStats={reviewStats}
    />
  )
}
