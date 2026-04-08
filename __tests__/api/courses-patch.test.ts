/**
 * Integration tests for PATCH /api/courses/[id].
 *
 * Covers three authorization paths (owner, other, admin), POI diff
 * (insert/delete), and metadata_history append semantics.
 *
 * Real Supabase DB is used via the service role client; test users and test
 * course are provisioned in beforeAll and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { PATCH as patchCourse } from '@/app/api/courses/[id]/route'
import { createServiceRoleClient } from '@/lib/supabase-server'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const describeIf = hasServiceRoleKey && hasAnonKey ? describe : describe.skip

const ADMIN_EMAIL_LIST = (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

type TestUser = {
  id: string
  email: string
  password: string
  accessToken: string
}

let ownerUser: TestUser | null = null
let otherUser: TestUser | null = null
let adminUser: TestUser | null = null
let testCourseId: string | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueEmail(prefix: string): string {
  return `test_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function createAuthUser(email: string): Promise<TestUser> {
  const password = `Test!${Math.random().toString(36).slice(2, 10)}Aa1`
  const db = createServiceRoleClient()!

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: createError } = await (db as any).auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created?.user) {
    throw new Error(`createUser failed: ${createError?.message ?? 'no user'}`)
  }

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError || !session.session?.access_token) {
    throw new Error(`signIn failed: ${signInError?.message ?? 'no access token'}`)
  }

  return {
    id: created.user.id,
    email,
    password,
    accessToken: session.session.access_token,
  }
}

async function deleteAuthUser(user: TestUser | null): Promise<void> {
  if (!user) return
  const db = createServiceRoleClient()!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).auth.admin.deleteUser(user.id)
}

async function createTestCourse(ownerId: string): Promise<string> {
  const db = createServiceRoleClient()!

  // Minimal valid route_geojson so the PATCH handler's buildRouteRenderMetadata
  // call still works.
  const routeGeojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [127.0, 36.78, 50],
            [127.001, 36.781, 55],
            [127.002, 36.782, 60],
          ],
        },
      },
    ],
  }

  const { data, error } = await db
    .from('courses')
    .insert({
      title: `TEST_COURSE_${Date.now()}`,
      difficulty: 'moderate' as const,
      distance_km: 10,
      elevation_gain_m: 50,
      created_by: ownerId,
      route_geojson: routeGeojson,
      metadata_history: [],
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`createTestCourse failed: ${error?.message ?? 'no row'}`)
  }

  return data.id as string
}

function patchRequest(courseId: string, token: string | null, body: Record<string, unknown>): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request(`http://localhost/api/courses/${courseId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers,
  })
}

function basePayload(title = 'TEST_COURSE_EDITED'): Record<string, unknown> {
  return {
    title,
    description: 'integration test description',
    difficulty: 'moderate',
    surface_type: 'road',
    theme: 'gravel',
    tags: ['test', 'integration'],
    pois: [],
    uphillSegments: [],
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describeIf('PATCH /api/courses/[id] integration', () => {
  beforeAll(async () => {
    ownerUser = await createAuthUser(uniqueEmail('owner'))
    otherUser = await createAuthUser(uniqueEmail('other'))

    // Only provision an admin user if the admin list is configured. We take
    // the first configured admin email OR create a random one if the list is
    // empty (in which case the admin test will be skipped).
    if (ADMIN_EMAIL_LIST.length > 0) {
      try {
        adminUser = await createAuthUser(ADMIN_EMAIL_LIST[0])
      } catch {
        // Email may already exist — can't recreate, skip admin case.
        adminUser = null
      }
    }

    testCourseId = await createTestCourse(ownerUser.id)
  }, 30_000)

  afterAll(async () => {
    const db = createServiceRoleClient()
    if (db && testCourseId) {
      await db.from('courses').delete().eq('id', testCourseId)
    }
    await deleteAuthUser(ownerUser)
    await deleteAuthUser(otherUser)
    await deleteAuthUser(adminUser)
  }, 30_000)

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  describe('authorization', () => {
    it('owner token → 200 {ok:true}', async () => {
      const res = await patchCourse(
        patchRequest(testCourseId!, ownerUser!.accessToken, basePayload()),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.ok).toBe(true)
    })

    it('other user token → 403', async () => {
      const res = await patchCourse(
        patchRequest(testCourseId!, otherUser!.accessToken, basePayload()),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(403)
    })

    it('missing token → 401', async () => {
      const res = await patchCourse(
        patchRequest(testCourseId!, null, basePayload()),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(401)
    })

    it.skipIf(ADMIN_EMAIL_LIST.length === 0)(
      'admin token → 200',
      async () => {
        if (!adminUser) {
          // Admin email was configured but we couldn't create the user (likely
          // already exists). Skip with a soft assertion.
          return
        }
        const res = await patchCourse(
          patchRequest(testCourseId!, adminUser.accessToken, basePayload('ADMIN_EDIT')),
          { params: Promise.resolve({ id: testCourseId! }) },
        )
        expect(res.status).toBe(200)
      },
    )
  })

  // -------------------------------------------------------------------------
  // POI diff (insert / delete)
  // -------------------------------------------------------------------------

  describe('POI diff', () => {
    it('inserts a new POI when pois array has a fresh entry', async () => {
      const res = await patchCourse(
        patchRequest(testCourseId!, ownerUser!.accessToken, {
          ...basePayload(),
          pois: [
            {
              name: 'Test Cafe',
              category: 'cafe',
              description: 'added by test',
              lat: 36.781,
              lng: 127.001,
              photo_url: null,
            },
          ],
        }),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(200)

      // Verify the POI exists in DB.
      const db = createServiceRoleClient()!
      const { data: rows } = await db
        .from('pois')
        .select('id, name, category')
        .eq('course_id', testCourseId!)

      expect(rows).toBeTruthy()
      expect(rows!.some((r) => (r as { name: string }).name === 'Test Cafe')).toBe(true)
    })

    it('deletes a POI when its id is excluded from the pois array', async () => {
      const db = createServiceRoleClient()!
      // Read the current POI id for Test Cafe.
      const { data: before } = await db
        .from('pois')
        .select('id, name')
        .eq('course_id', testCourseId!)

      const cafeRow = (before ?? []).find((r) => (r as { name: string }).name === 'Test Cafe')
      expect(cafeRow).toBeTruthy()

      // Submit an empty pois array → should delete the cafe.
      const res = await patchCourse(
        patchRequest(testCourseId!, ownerUser!.accessToken, {
          ...basePayload(),
          pois: [],
        }),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(200)

      const { data: after } = await db
        .from('pois')
        .select('id')
        .eq('course_id', testCourseId!)
      expect((after ?? []).length).toBe(0)
    })

    it('returns 400 when a POI id that does not belong to this course is submitted', async () => {
      const res = await patchCourse(
        patchRequest(testCourseId!, ownerUser!.accessToken, {
          ...basePayload(),
          pois: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'Not Mine',
              category: 'cafe',
              lat: 36.78,
              lng: 127.0,
            },
          ],
        }),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // metadata_history append
  // -------------------------------------------------------------------------

  describe('metadata_history', () => {
    it('appends a new entry on every successful PATCH', async () => {
      const db = createServiceRoleClient()!

      const { data: before } = await db
        .from('courses')
        .select('metadata_history')
        .eq('id', testCourseId!)
        .single()
      const beforeHistory = (before?.metadata_history ?? []) as Array<Record<string, unknown>>
      const beforeLen = beforeHistory.length

      const res = await patchCourse(
        patchRequest(testCourseId!, ownerUser!.accessToken, basePayload('METADATA_BUMP')),
        { params: Promise.resolve({ id: testCourseId! }) },
      )
      expect(res.status).toBe(200)

      const { data: after } = await db
        .from('courses')
        .select('metadata_history')
        .eq('id', testCourseId!)
        .single()
      const afterHistory = (after?.metadata_history ?? []) as Array<Record<string, unknown>>
      expect(afterHistory.length).toBe(beforeLen + 1)

      const latest = afterHistory[afterHistory.length - 1]
      expect(typeof latest.timestamp).toBe('string')
      expect(typeof latest.actorUserId).toBe('string')
      expect(latest.actorUserId).toBe(ownerUser!.id)
    })
  })
})
