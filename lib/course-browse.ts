import { hydrateCourseReviews } from '@/lib/course-reviews'
import { hydrateUploaderNames } from '@/lib/course-uploader'
import { countActiveFilters, parseFilterParams } from '@/lib/filter'
import { supabase } from '@/lib/supabase'

const RANDOM_SAMPLE_FETCH = 100
const RANDOM_SAMPLE_DISPLAY = 20

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
import type {
  CourseBrowseItem,
  CourseListItem,
  CourseReview,
  RoutePreviewPoint,
} from '@/types/course'

const COURSE_BROWSE_FIELDS = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, uploader_name, uploader_emoji, route_preview_points, surface_type, preview_image_url'
const COURSE_BROWSE_FIELDS_FALLBACK = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, route_preview_points, surface_type, preview_image_url'
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
  route_preview_points: RoutePreviewPoint[] | null
  surface_type: 'road' | 'gravel' | 'mtb' | null
  preview_image_url: string | null
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

  if (filters.regionId) {
    nextQuery = nextQuery.eq('region_id', filters.regionId)
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
  const filters = parseFilterParams(rawParams)
  const searchQuery = getSearchQuery(rawParams)
  const isUnfiltered = countActiveFilters(filters) === 0 && !searchQuery

  const baseQuery = supabase
    .from('courses')
    .select(COURSE_BROWSE_FIELDS)
    .order('created_at', { ascending: false })

  const browseQuery = applyCourseFilters(
    isUnfiltered ? baseQuery.limit(RANDOM_SAMPLE_FETCH) : baseQuery,
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
    const fallbackBase = supabase
      .from('courses')
      .select(COURSE_BROWSE_FIELDS_FALLBACK)
      .order('created_at', { ascending: false })
    const fallbackQuery = applyCourseFilters(
      isUnfiltered ? fallbackBase.limit(RANDOM_SAMPLE_FETCH) : fallbackBase,
      rawParams,
    )
    const fallback = await fallbackQuery
    courseRows = (fallback.data ?? null) as unknown as CourseBrowseRow[] | null
    coursesError = fallback.error ? { message: fallback.error.message } : null
  }

  if (isUnfiltered && courseRows) {
    courseRows = shuffled(courseRows).slice(0, RANDOM_SAMPLE_DISPLAY)
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

  // Supabase .in() sends IDs as a URL query param — large arrays exceed URL limits.
  // Batch into chunks of 100 to stay safely within limits.
  const BATCH = 100
  function chunkIds(ids: string[]): string[][] {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += BATCH) chunks.push(ids.slice(i, i + BATCH))
    return chunks
  }

  const [statsRows, reviewRows] = await Promise.all([
    Promise.all(
      chunkIds(courseIds).map((chunk) =>
        supabase
          .from('course_review_stats')
          .select('course_id, review_count, avg_rating')
          .in('course_id', chunk),
      ),
    ),
    Promise.all(
      chunkIds(courseIds).map((chunk) =>
        supabase
          .from('course_reviews_public')
          .select('id, course_id, user_id, rating, content, ridden_at, perceived_difficulty, condition_note, created_at, updated_at, author_name, author_emoji')
          .in('course_id', chunk)
          .order('created_at', { ascending: false }),
      ),
    ),
  ])

  const statsError = statsRows.find((r) => r.error)?.error
  if (statsError) {
    throw new Error(`browse review stats load failed: ${statsError.message}`)
  }
  const reviewsError = reviewRows.find((r) => r.error)?.error
  if (reviewsError) {
    throw new Error(`browse reviews load failed: ${reviewsError.message}`)
  }

  const statsResult = { data: statsRows.flatMap((r) => r.data ?? []) }
  const reviewsResult = { data: reviewRows.flatMap((r) => r.data ?? []) }

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
      surface_type: course.surface_type ?? null,
      review_count: stats?.review_count ?? 0,
      avg_rating: stats?.avg_rating ?? null,
      latest_reviewed_at: latestReview?.created_at ?? null,
      review_preview: summarizeReview(latestReview?.content),
      review_author_name: latestReview?.author_name ?? null,
      review_author_emoji: latestReview?.author_emoji ?? null,
      route_preview: (course.route_preview_points ?? []) as RoutePreviewPoint[],
      preview_image_url: course.preview_image_url ?? null,
    } satisfies CourseBrowseItem
  })
}
