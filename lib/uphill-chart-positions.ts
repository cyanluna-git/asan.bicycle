/**
 * Server-side utility: compute and persist chart km positions for course uphills.
 *
 * Called once after `match_course_uphills` RPC runs (on course upload or edit).
 * Stores chart_start_km / chart_end_km in course_uphills so every subsequent
 * course detail request can just read the pre-computed values.
 *
 * Uses Node.js Buffer — server-side only.
 */

import { createServiceRoleClient } from '@/lib/supabase-server'
import type { RouteGeoJSON, UphillSegment } from '@/types/course'

// ── WKB helpers (identical to explore-page-data.ts but here for server lib) ──

function decodeWkbPoint(wkbHex: string): { lat: number; lng: number } | null {
  try {
    const buf = Buffer.from(wkbHex, 'hex')
    const le = buf[0] === 1
    const wkbType = le ? buf.readUInt32LE(1) : buf.readUInt32BE(1)
    const hasSRID = (wkbType & 0x20000000) !== 0
    const offset = hasSRID ? 9 : 5
    const lng = le ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset)
    const lat = le ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8)
    return { lat, lng }
  } catch {
    return null
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function findKmOnRoute(
  route: RouteGeoJSON,
  targetLat: number,
  targetLng: number,
  maxDistKm = 0.3,
): number | null {
  let cumKm = 0
  let bestKm = 0
  let bestDist = Infinity
  let prevLat: number | null = null
  let prevLng: number | null = null

  for (const feature of route.features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coord of feature.geometry.coordinates) {
      const lng = coord[0] as number
      const lat = coord[1] as number
      if (prevLat !== null && prevLng !== null) {
        cumKm += haversineKm(prevLat, prevLng, lat, lng)
      }
      const dist = haversineKm(targetLat, targetLng, lat, lng)
      if (dist < bestDist) {
        bestDist = dist
        bestKm = cumKm
      }
      prevLat = lat
      prevLng = lng
    }
  }
  return bestDist > maxDistKm ? null : Math.round(bestKm * 100) / 100
}

function uphillChartSegment(
  route: RouteGeoJSON,
  startPos: { lat: number; lng: number },
  endPos: { lat: number; lng: number },
  distanceM: number,
): { start_km: number; end_km: number } | null {
  const startKm = findKmOnRoute(route, startPos.lat, startPos.lng)
  const endKm   = findKmOnRoute(route, endPos.lat,   endPos.lng)

  if (startKm === null || endKm === null) return null
  if (startKm >= endKm) return null  // descending direction

  const observedKm = endKm - startKm
  const expectedKm = distanceM / 1000
  if (expectedKm > 0 && observedKm > expectedKm * 3) return null

  return {
    start_km: startKm,
    end_km: Math.round((startKm + expectedKm) * 100) / 100,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

type FamousUphillRow = {
  id: string
  distance_m: number | null
  start_latlng: string | null
  end_latlng: string | null
}

/**
 * Compute chart km positions for all famous uphills matched to a course,
 * then persist the results to course_uphills.chart_start_km / chart_end_km.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY to write course_uphills.
 */
export async function computeAndSaveUphillChartPositions(courseId: string): Promise<void> {
  const db = createServiceRoleClient()
  if (!db) {
    console.warn('[uphill-chart] SUPABASE_SERVICE_ROLE_KEY not set — skipping')
    return
  }

  // 1. Fetch the course route
  const { data: course } = await db
    .from('courses')
    .select('route_geojson')
    .eq('id', courseId)
    .single()

  const route = course?.route_geojson as RouteGeoJSON | null | undefined
  if (!route) return

  // Check it has actual coordinate data
  const hasCoords = route.features?.some(
    (f) => f.geometry?.type === 'LineString' && (f.geometry.coordinates?.length ?? 0) > 0,
  )
  if (!hasCoords) return

  // 2. Fetch matched uphills with latlng fields
  const { data: rows } = await db
    .from('course_uphills')
    .select('famous_uphill_id, famous_uphills(id, distance_m, start_latlng, end_latlng)')
    .eq('course_id', courseId)

  if (!rows?.length) return

  // 3. Compute positions in parallel
  const updates = (rows as unknown as Array<{ famous_uphill_id: string; famous_uphills: FamousUphillRow | null }>)
    .map(({ famous_uphill_id, famous_uphills: uphill }) => {
      if (!uphill?.start_latlng || !uphill?.end_latlng) {
        return { famous_uphill_id, chart_start_km: null, chart_end_km: null }
      }

      const startPos = decodeWkbPoint(uphill.start_latlng)
      const endPos   = decodeWkbPoint(uphill.end_latlng)

      if (!startPos || !endPos) {
        return { famous_uphill_id, chart_start_km: null, chart_end_km: null }
      }

      const seg = uphillChartSegment(route, startPos, endPos, uphill.distance_m ?? 0)
      return {
        famous_uphill_id,
        chart_start_km: seg?.start_km ?? null,
        chart_end_km:   seg?.end_km   ?? null,
      }
    })

  // 4. Persist — Supabase doesn't support bulk update by composite key,
  //    so upsert with the full primary key set.
  const upsertRows = updates.map(({ famous_uphill_id, chart_start_km, chart_end_km }) => ({
    course_id: courseId,
    famous_uphill_id,
    chart_start_km,
    chart_end_km,
  }))

  const { error } = await db
    .from('course_uphills')
    .upsert(upsertRows, { onConflict: 'course_id,famous_uphill_id' })

  if (error) {
    console.error('[uphill-chart] upsert error:', error.message)
  }
}
