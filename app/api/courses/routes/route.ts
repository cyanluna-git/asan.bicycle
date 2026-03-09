import { NextResponse } from 'next/server'
import { computeRouteBounds, normalizeRouteRenderMetadata } from '@/lib/course-render-metadata'
import { parseFilterParams } from '@/lib/filter'
import { supabase } from '@/lib/supabase'
import type { RoutePreviewPoint } from '@/types/course'

const ROUTE_FIELDS = 'id, route_preview_points, route_render_metadata'

type CourseRouteRow = {
  id: string
  route_preview_points: RoutePreviewPoint[] | null
  route_render_metadata: unknown
}

function buildCourseRoutesQuery(
  filters: ReturnType<typeof parseFilterParams>,
) {
  let query = supabase
    .from('courses')
    .select(ROUTE_FIELDS)
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filters = parseFilterParams(searchParams)

  const { data, error } = await buildCourseRoutesQuery(filters)

  if (error) {
    console.error('[api/courses/routes] query error:', error.message, error.details)
    return NextResponse.json({ error: 'Failed to load course routes.' }, { status: 500 })
  }

  const routes = ((data ?? []) as CourseRouteRow[]).map((course) => {
    const previewPoints = Array.isArray(course.route_preview_points)
      ? (course.route_preview_points as RoutePreviewPoint[])
      : []
    const metadata = normalizeRouteRenderMetadata(course.route_render_metadata)

    return {
      id: course.id,
      route_geojson: null,
      route_preview_points: previewPoints,
      route_render_metadata: metadata ?? (previewPoints.length > 0
        ? {
            version: 1,
            bounds: computeRouteBounds(previewPoints),
            hoverProfile: [],
            slopeSegments: [],
          }
        : null),
    }
  })

  return NextResponse.json({ routes })
}
