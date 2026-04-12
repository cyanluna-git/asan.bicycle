import { NextRequest, NextResponse } from 'next/server'
import { createAnonServerClient, createServiceRoleClient } from '@/lib/supabase-server'
import type { RouteGeoJSON } from '@/types/course'

// ── GET /api/famous-uphills ───────────────────────────────────────────────────
// Returns all famous uphills. Used primarily for test verification.

export async function GET(_req: NextRequest) {
  const db = createAnonServerClient()
  const { data, error } = await db
    .from('famous_uphills')
    .select('id, name, distance_m, elevation_gain_m, avg_grade, climb_category')
    .order('name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// ── Geo helpers ──────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLng = (lng2 - lng1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

interface SegmentResult {
  coords: [number, number][]   // [lng, lat]
  distanceM: number
  elevationGainM: number
  avgGrade: number
  maxGrade: number
}

function extractSegment(
  routeGeojson: RouteGeoJSON,
  startKm: number,
  endKm: number,
): SegmentResult | null {
  // Collect all coordinates (with optional elevation at index 2)
  type Coord3 = [number, number, number | undefined]
  const all: Coord3[] = []

  for (const feature of routeGeojson.features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const c of feature.geometry.coordinates) {
      all.push([c[0] as number, c[1] as number, c[2] as number | undefined])
    }
  }

  if (all.length < 2) return null

  // Cumulative distances
  const cum: number[] = [0]
  for (let i = 1; i < all.length; i++) {
    cum.push(cum[i - 1] + haversineKm(all[i - 1][1], all[i - 1][0], all[i][1], all[i][0]))
  }

  // Slice between startKm and endKm (with small tolerance)
  const TOLERANCE = 0.02
  const slice: Coord3[] = []
  for (let i = 0; i < all.length; i++) {
    if (cum[i] >= startKm - TOLERANCE && cum[i] <= endKm + TOLERANCE) {
      slice.push(all[i])
    }
  }

  if (slice.length < 2) return null

  // Compute stats from the slice
  const distanceM = (endKm - startKm) * 1000
  let elevationGainM = 0
  let maxGrade = 0

  for (let i = 1; i < slice.length; i++) {
    const ele0 = slice[i - 1][2]
    const ele1 = slice[i][2]
    if (ele0 != null && ele1 != null) {
      const dEle = ele1 - ele0
      if (dEle > 0) elevationGainM += dEle

      const dKm = haversineKm(slice[i - 1][1], slice[i - 1][0], slice[i][1], slice[i][0])
      if (dKm > 0) {
        const grade = (dEle / (dKm * 1000)) * 100
        if (grade > maxGrade) maxGrade = grade
      }
    }
  }

  const avgGrade = distanceM > 0 ? (elevationGainM / distanceM) * 100 : 0

  return {
    coords: slice.map(([lng, lat]) => [lng, lat]),
    distanceM,
    elevationGainM: Math.round(elevationGainM * 10) / 10,
    avgGrade: Math.round(avgGrade * 100) / 100,
    maxGrade: Math.round(maxGrade * 100) / 100,
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const db = createServiceRoleClient()
  if (!db) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const body = await req.json() as {
    course_id: string
    name: string
    start_km: number
    end_km: number
  }

  const { course_id, name, start_km, end_km } = body
  if (!course_id || !name?.trim() || start_km == null || end_km == null || start_km >= end_km) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Fetch course route
  const { data: course } = await db
    .from('courses')
    .select('route_geojson')
    .eq('id', course_id)
    .single()

  if (!course?.route_geojson) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }

  const segment = extractSegment(course.route_geojson as RouteGeoJSON, start_km, end_km)
  if (!segment || segment.coords.length < 2) {
    return NextResponse.json({ error: 'Could not extract route segment' }, { status: 422 })
  }

  // Insert via RPC (handles PostGIS geometry)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newId, error } = await (db as any).rpc('register_user_uphill', {
    p_name: name.trim(),
    p_distance_m: segment.distanceM,
    p_elevation_gain_m: segment.elevationGainM,
    p_avg_grade: segment.avgGrade,
    p_max_grade: segment.maxGrade,
    p_coords: segment.coords,
  })

  if (error) {
    console.error('[famous-uphills] RPC error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: newId }, { status: 201 })
}
