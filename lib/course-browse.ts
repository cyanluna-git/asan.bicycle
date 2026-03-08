import { hydrateCourseReviews } from '@/lib/course-reviews'
import { buildRoutePreview } from '@/lib/course-route-preview'
import { hydrateUploaderNames } from '@/lib/course-uploader'
import { parseFilterParams } from '@/lib/filter'
import { supabase } from '@/lib/supabase'
import type {
  CourseBrowseItem,
  CourseListItem,
  CourseReview,
  RouteGeoJSON,
} from '@/types/course'

const COURSE_BROWSE_FIELDS = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, uploader_name, uploader_emoji, route_geojson'
const COURSE_BROWSE_FIELDS_FALLBACK = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, route_geojson'
type CourseBrowseRow = {
  id: string
  title: string
  difficulty: CourseListItem['difficulty']
  distance_km: number
  elevation_gain_m: number
  theme: string | null
  tags: string[]
  created_by: string | null
  uploader_name?: string | null
  uploader_emoji?: string | null
  route_geojson: RouteGeoJSON | null
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

type QueryLike = {
  eq: (column: string, value: string) => QueryLike
  in: (column: string, values: string[]) => QueryLike
  lte: (column: string, value: number) => QueryLike
  gt: (column: string, value: number) => QueryLike
  or: (value: string) => QueryLike
}

export function applyCourseFilters<T>(query: T, rawParams: URLSearchParams | Record<string, string | string[] | undefined>): T {
  const filters = parseFilterParams(rawParams)
  let nextQuery = query as unknown as QueryLike

  if (filters.startPoint) {
    nextQuery = nextQuery.eq('start_point_id', filters.startPoint)
  }

  if (filters.difficulty.length > 0) {
    nextQuery = nextQuery.in('difficulty', filters.difficulty)
  }

  if (filters.distance) {
    if (filters.distance === 'short') nextQuery = nextQuery.lte('distance_km', 50)
    else if (filters.distance === 'medium') nextQuery = nextQuery.lte('distance_km', 80)
    else if (filters.distance === 'long') nextQuery = nextQuery.lte('distance_km', 120)
    else if (filters.distance === 'ultralong') nextQuery = nextQuery.gt('distance_km', 120)
  }

  if (filters.themes.length > 0) {
    nextQuery = nextQuery.in('theme', filters.themes)
  }

  const searchQuery = getSearchQuery(rawParams)
  if (searchQuery) {
    const escaped = escapeIlike(searchQuery)
    nextQuery = nextQuery.or(
      [
        `title.ilike.%${escaped}%`,
        `description.ilike.%${escaped}%`,
        `theme.ilike.%${escaped}%`,
      ].join(','),
    )
  }

  return nextQuery as T
}

export function getSearchQuery(rawParams: URLSearchParams | Record<string, string | string[] | undefined>) {
  const rawValue =
    rawParams instanceof URLSearchParams
      ? rawParams.get('q')
      : Array.isArray(rawParams.q)
        ? rawParams.q[0] ?? null
        : rawParams.q ?? null

  const normalized = rawValue?.trim() ?? ''
  return normalized || null
}

function escapeIlike(value: string) {
  return value.replace(/[%_,]/g, (character) => `\\${character}`)
}

function summarizeReview(content: string | null | undefined, maxLength = 88) {
  if (!content) return null
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

export async function fetchBrowseCourses(rawParams: URLSearchParams | Record<string, string | string[] | undefined>) {
  const browseQuery = applyCourseFilters(
    supabase
      .from('courses')
      .select(COURSE_BROWSE_FIELDS)
      .order('created_at', { ascending: false }),
    rawParams,
  )

  const browseResult = await browseQuery

  let {
    data: courseRows,
    error: coursesError,
  }: {
    data: CourseBrowseRow[] | null
    error: { message: string } | null
  } = {
    data: (browseResult.data ?? null) as CourseBrowseRow[] | null,
    error: browseResult.error ? { message: browseResult.error.message } : null,
  }

  if (coursesError && /(uploader_name|uploader_emoji)/i.test(coursesError.message)) {
    const fallbackQuery = applyCourseFilters(
      supabase
        .from('courses')
        .select(COURSE_BROWSE_FIELDS_FALLBACK)
        .order('created_at', { ascending: false }),
      rawParams,
    )
    const fallback = await fallbackQuery
    courseRows = (fallback.data ?? null) as unknown as CourseBrowseRow[] | null
    coursesError = fallback.error ? { message: fallback.error.message } : null
  }

  if (coursesError) {
    throw new Error(`browse courses load failed: ${coursesError.message}`)
  }

  const hydratedCourses = await hydrateUploaderNames(
    ((courseRows ?? []) as unknown) as CourseBrowseRow[],
  )

  const courseIds = hydratedCourses.map((course) => course.id)
  if (courseIds.length === 0) {
    return [] as CourseBrowseItem[]
  }

  const [statsResult, reviewsResult] = await Promise.all([
    supabase
      .from('course_review_stats')
      .select('course_id, review_count, avg_rating')
      .in('course_id', courseIds),
    supabase
      .from('course_reviews_public')
      .select('id, course_id, user_id, rating, content, ridden_at, perceived_difficulty, condition_note, created_at, updated_at, author_name, author_emoji')
      .in('course_id', courseIds)
      .order('created_at', { ascending: false }),
  ])

  if (statsResult.error) {
    throw new Error(`browse review stats load failed: ${statsResult.error.message}`)
  }

  if (reviewsResult.error) {
    throw new Error(`browse reviews load failed: ${reviewsResult.error.message}`)
  }

  const hydratedReviews = await hydrateCourseReviews(
    ((reviewsResult.data ?? []) as unknown) as CourseReviewRow[],
  )

  const statsByCourseId = new Map(
    (statsResult.data ?? []).map((stat) => [
      stat.course_id,
      {
        review_count: Number(stat.review_count ?? 0),
        avg_rating:
          typeof stat.avg_rating === 'number'
            ? stat.avg_rating
            : stat.avg_rating == null
              ? null
              : Number(stat.avg_rating),
      },
    ]),
  )

  const latestReviewByCourseId = new Map<string, CourseReviewRow>()
  for (const review of hydratedReviews) {
    if (!latestReviewByCourseId.has(review.course_id)) {
      latestReviewByCourseId.set(review.course_id, review)
    }
  }

  return hydratedCourses.map((course) => {
    const stats = statsByCourseId.get(course.id)
    const latestReview = latestReviewByCourseId.get(course.id)

    return {
      id: course.id,
      title: course.title,
      difficulty: course.difficulty,
      distance_km: course.distance_km,
      elevation_gain_m: course.elevation_gain_m,
      theme: course.theme,
      tags: course.tags,
      created_by: course.created_by,
      uploader_name: course.uploader_name ?? null,
      uploader_emoji: course.uploader_emoji ?? null,
      review_count: stats?.review_count ?? 0,
      avg_rating: stats?.avg_rating ?? null,
      latest_reviewed_at: latestReview?.created_at ?? null,
      review_preview: summarizeReview(latestReview?.content),
      review_author_name: latestReview?.author_name ?? null,
      review_author_emoji: latestReview?.author_emoji ?? null,
      route_preview: buildRoutePreview(course.route_geojson ?? null),
    } satisfies CourseBrowseItem
  })
}
