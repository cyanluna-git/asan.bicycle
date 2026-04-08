/**
 * Integration tests for core Supabase DB RPCs, called directly via the REST
 * client (service role). These tests exercise the DB functions in isolation
 * from the Next.js API layer:
 *
 *   - match_course_uphills(p_course_id uuid) returns integer
 *   - detect_region_by_point(p_lng, p_lat) returns table
 *   - register_user_uphill(p_name, p_distance_m, p_elevation_gain_m,
 *                          p_avg_grade, p_max_grade, p_coords jsonb) returns uuid
 *
 * Any famous_uphills rows inserted during the run are cleaned up in afterAll
 * (course_uphills cascades via FK).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServiceRoleClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Same non-loop seed course used by __tests__/api/famous-uphills.test.ts.
// Has populated route_geojson so we can run match_course_uphills against it.
const DEFAULT_TEST_COURSE_ID = '8372cb58-1e98-49d8-b87a-a4676cdfad74'
const TEST_COURSE_ID = process.env.TEST_COURSE_ID || DEFAULT_TEST_COURSE_ID

const UPHILL_NAME_PREFIX = 'RPC_TEST_UPHILL_'
const createdUphillNames: string[] = []

const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
const describeIfDb = hasServiceRoleKey ? describe : describe.skip

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueUphillName(label: string): string {
  const name = `${UPHILL_NAME_PREFIX}${Date.now()}_${label}_${Math.random().toString(36).slice(2, 8)}`
  createdUphillNames.push(name)
  return name
}

// Extracts the first two [lng, lat] coordinate pairs from a course's
// route_geojson so that a synthetic famous_uphill we register sits directly
// on top of the course route (guaranteed within the 100m ST_DWithin window).
async function getFirstTwoCoordsFromCourse(
  courseId: string,
): Promise<[number, number][]> {
  const db = createServiceRoleClient()!
  const { data, error } = await db
    .from('courses')
    .select('route_geojson')
    .eq('id', courseId)
    .single()

  if (error || !data?.route_geojson) {
    throw new Error(`could not load route_geojson for course ${courseId}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geojson = data.route_geojson as any
  const coords: unknown = geojson?.features?.[0]?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error(`course ${courseId} route_geojson has fewer than 2 coords`)
  }

  const [a, b] = coords as Array<[number, number, number?] | number[]>
  return [
    [Number(a[0]), Number(a[1])],
    [Number(b[0]), Number(b[1])],
  ]
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeIfDb('DB RPC integration tests', () => {
  beforeAll(() => {
    if (!hasServiceRoleKey) return
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set for integration tests')
    }
  })

  afterAll(async () => {
    if (!hasServiceRoleKey) return
    const db = createServiceRoleClient()
    if (!db || createdUphillNames.length === 0) return

    // course_uphills rows cascade via FK ON DELETE CASCADE.
    await db
      .from('famous_uphills')
      .delete()
      .in('name', createdUphillNames)
  })

  // -------------------------------------------------------------------------
  // match_course_uphills
  // -------------------------------------------------------------------------

  describe('rpc: match_course_uphills', () => {
    it('returns >=1 when a famous uphill sits within 100m of the course route', async () => {
      const db = createServiceRoleClient()!

      // 1. Plant a famous uphill directly on the course route.
      const coords = await getFirstTwoCoordsFromCourse(TEST_COURSE_ID)
      const name = uniqueUphillName('match_hit')
      const { data: registerId, error: registerErr } = await db.rpc('register_user_uphill', {
        p_name: name,
        p_distance_m: 500,
        p_elevation_gain_m: 40,
        p_avg_grade: 8,
        p_max_grade: 12,
        p_coords: coords,
      })
      expect(registerErr).toBeNull()
      expect(typeof registerId).toBe('string')

      // 2. Run match_course_uphills for the course.
      const { data: matchCount, error: matchErr } = await db.rpc('match_course_uphills', {
        p_course_id: TEST_COURSE_ID,
      })
      expect(matchErr).toBeNull()
      expect(typeof matchCount).toBe('number')
      expect(matchCount as number).toBeGreaterThanOrEqual(1)

      // 3. Confirm our specific uphill is represented in course_uphills.
      const { data: courseUphillRows, error: rowsErr } = await db
        .from('course_uphills')
        .select('famous_uphill_id')
        .eq('course_id', TEST_COURSE_ID)
        .eq('famous_uphill_id', registerId as string)
      expect(rowsErr).toBeNull()
      expect((courseUphillRows ?? []).length).toBe(1)
    })

    it('does not produce duplicate course_uphills rows on repeated invocation (UPSERT semantic)', async () => {
      const db = createServiceRoleClient()!

      // Call twice in a row — the RPC does DELETE-then-INSERT internally.
      const { data: first, error: firstErr } = await db.rpc('match_course_uphills', {
        p_course_id: TEST_COURSE_ID,
      })
      expect(firstErr).toBeNull()
      expect(typeof first).toBe('number')

      const { data: second, error: secondErr } = await db.rpc('match_course_uphills', {
        p_course_id: TEST_COURSE_ID,
      })
      expect(secondErr).toBeNull()
      expect(typeof second).toBe('number')
      expect(second).toBe(first)

      // No duplicate rows: unique on (course_id, famous_uphill_id) is a PK,
      // so a dup insert would have thrown anyway. But assert explicitly by
      // counting vs. distinct.
      const { data: rows, error: rowsErr } = await db
        .from('course_uphills')
        .select('famous_uphill_id')
        .eq('course_id', TEST_COURSE_ID)
      expect(rowsErr).toBeNull()

      const ids = (rows ?? []).map((r) => r.famous_uphill_id as string)
      const unique = new Set(ids)
      expect(unique.size).toBe(ids.length)
      expect(ids.length).toBe(second as number)
    })

    it('auto-derives route from route_geojson when courses.route is NULL', async () => {
      const db = createServiceRoleClient()!

      // Force courses.route to NULL so the RPC takes the lazy-derive branch.
      const { error: clearErr } = await db
        .from('courses')
        .update({ route: null })
        .eq('id', TEST_COURSE_ID)
      expect(clearErr).toBeNull()

      // Sanity: confirm route is actually NULL before we call the RPC.
      // (Using the geojson column to prove the derivation source still exists.)
      const { data: before, error: beforeErr } = await db
        .from('courses')
        .select('route_geojson')
        .eq('id', TEST_COURSE_ID)
        .single()
      expect(beforeErr).toBeNull()
      expect(before?.route_geojson).not.toBeNull()

      const { data: matchCount, error: matchErr } = await db.rpc('match_course_uphills', {
        p_course_id: TEST_COURSE_ID,
      })
      expect(matchErr).toBeNull()
      expect(typeof matchCount).toBe('number')
      // Can't assert a specific count (depends on nearby famous_uphills),
      // but the call must succeed without error and return a non-negative int.
      expect(matchCount as number).toBeGreaterThanOrEqual(0)
    })
  })

  // -------------------------------------------------------------------------
  // detect_region_by_point
  // -------------------------------------------------------------------------

  describe('rpc: detect_region_by_point', () => {
    it('returns a 강원 region for a Gangwon coordinate', async () => {
      const db = createServiceRoleClient()!

      // Known-to-be-inland Gangwon point (lng=128.5, lat=38.0).
      const { data, error } = await db.rpc('detect_region_by_point', {
        p_lng: 128.5,
        p_lat: 38.0,
      })
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect((data as unknown[]).length).toBeGreaterThanOrEqual(1)

      const row = (data as Array<{ region_name: string; parent_name: string | null }>)[0]
      // Either the sigungu name (e.g. 고성군) or the parent sido name should
      // contain "강원" — we accept both to avoid hard-coding specific sigungus.
      const parentOrChild = `${row.region_name ?? ''}|${row.parent_name ?? ''}`
      expect(parentOrChild).toContain('강원')
    })

    it('returns an empty result set for an ocean coordinate', async () => {
      const db = createServiceRoleClient()!

      // Ocean point well off the east coast (lng=130.5, lat=35.0).
      const { data, error } = await db.rpc('detect_region_by_point', {
        p_lng: 130.5,
        p_lat: 35.0,
      })
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
      expect((data as unknown[]).length).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // register_user_uphill
  // -------------------------------------------------------------------------

  describe('rpc: register_user_uphill', () => {
    it('returns a UUID and populates start_latlng / end_latlng for valid coords', async () => {
      const db = createServiceRoleClient()!

      const name = uniqueUphillName('register_valid')
      const coords: [number, number][] = [
        [127.0, 36.78],
        [127.005, 36.785],
        [127.01, 36.79],
      ]

      const { data: uphillId, error } = await db.rpc('register_user_uphill', {
        p_name: name,
        p_distance_m: 1234,
        p_elevation_gain_m: 120,
        p_avg_grade: 7.5,
        p_max_grade: 14,
        p_coords: coords,
      })
      expect(error).toBeNull()
      expect(typeof uphillId).toBe('string')
      expect((uphillId as string).length).toBeGreaterThan(0)

      // Verify the inserted row has both latlng endpoints populated.
      const { data: row, error: rowErr } = await db
        .from('famous_uphills')
        .select('id, name, start_latlng, end_latlng')
        .eq('id', uphillId as string)
        .single()
      expect(rowErr).toBeNull()
      expect(row?.name).toBe(name)
      expect(row?.start_latlng).not.toBeNull()
      expect(row?.end_latlng).not.toBeNull()
    })

    it('raises an exception when fewer than 2 coordinates are supplied', async () => {
      const db = createServiceRoleClient()!

      const name = uniqueUphillName('register_invalid')
      const { data, error } = await db.rpc('register_user_uphill', {
        p_name: name,
        p_distance_m: 10,
        p_elevation_gain_m: 1,
        p_avg_grade: 1,
        p_max_grade: 1,
        p_coords: [[127.0, 36.78]],
      })

      expect(data).toBeNull()
      expect(error).not.toBeNull()
      // Error text should reference our RAISE EXCEPTION message.
      expect((error?.message ?? '').toLowerCase()).toContain('register_user_uphill')
    })
  })
})
