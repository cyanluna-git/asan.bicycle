import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COURSE_ALBUM_BUCKET } from '@/lib/course-album'

// ---------------------------------------------------------------------------
// Mock state – each test configures these before calling POST.
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-abc-123'
const TEST_COURSE_ID = 'course-xyz-789'
const SUPABASE_URL = 'https://test.supabase.co'

let mockGetUserResult: { data: { user: unknown }; error: unknown }
let mockCourseSelectResult: { data: unknown; error: unknown }
let mockCountResult: { data: unknown; error: unknown; count: number | null }
let mockStorageListResult: { data: unknown; error: unknown }
let mockInsertResult: { data: unknown; error: unknown }
let insertCalled: boolean
let capturedStorageBucket: string | undefined
let capturedStorageFolder: string | undefined
let capturedStorageSearch: string | undefined

// ---------------------------------------------------------------------------
// A chainable builder. Every method call (.eq, .select, .order, .limit, etc.)
// returns a new chain wrapping the same terminal. Property reads (.error,
// .data, .count) resolve from the terminal value. `single()` also returns
// the terminal.
// ---------------------------------------------------------------------------

function chain(getTerminal: () => Record<string, unknown>) {
  const proxy: unknown = new Proxy(
    () => {}, // function target so both call and get traps work
    {
      get(_target, prop: string) {
        // Not thenable – so `await chain(...)` resolves to the proxy itself
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined

        // single / maybeSingle are terminal calls that return the result object
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => getTerminal()
        }

        // Property reads that are not functions → resolve from terminal
        const terminal = getTerminal()
        if (prop in terminal) {
          return terminal[prop]
        }

        // Chained method calls → return a new proxy wrapping the same terminal
        return (..._args: unknown[]) => proxy
      },
      // If the proxy itself gets called (shouldn't happen, but be safe)
      apply() {
        return proxy
      },
    },
  )
  return proxy
}

// ---------------------------------------------------------------------------
// Build mock Supabase clients
// ---------------------------------------------------------------------------

function buildMockClient(role: 'anon' | 'write') {
  return {
    auth: {
      getUser: () => mockGetUserResult,
    },
    from: (table: string) => {
      if (table === 'courses') {
        return chain(() => mockCourseSelectResult as Record<string, unknown>)
      }
      if (table === 'course_album_photos') {
        // The route calls two different chains on this table:
        //   1) .select('id', { count, head }).eq(...).eq(...)  →  count query
        //   2) .insert({...}).select(...).single()             →  insert query
        //
        // We distinguish them by intercepting `select` and `insert` as the
        // first method called after `.from()`.
        return {
          select: (..._args: unknown[]) =>
            chain(() => mockCountResult as unknown as Record<string, unknown>),
          insert: (..._args: unknown[]) => {
            if (role === 'write') insertCalled = true
            return chain(() => mockInsertResult as unknown as Record<string, unknown>)
          },
        }
      }
      return chain(() => ({ data: null, error: null }))
    },
    storage: {
      from: (bucket: string) => {
        capturedStorageBucket = bucket
        return {
          list: (folder: string, opts: { search: string; limit: number }) => {
            capturedStorageFolder = folder
            capturedStorageSearch = opts.search
            return mockStorageListResult
          },
        }
      },
    },
  }
}

vi.mock('@/lib/supabase-server', () => ({
  createAnonServerClient: (accessToken?: string) => {
    return accessToken ? buildMockClient('write') : buildMockClient('anon')
  },
  createServiceRoleClient: () => null,
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePublicUrl(storagePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${COURSE_ALBUM_BUCKET}/${storagePath}`
}

function validBody(overrides: Record<string, unknown> = {}) {
  const storagePath = `${TEST_USER_ID}/${TEST_COURSE_ID}/photo.webp`
  return {
    storagePath,
    publicUrl: makePublicUrl(storagePath),
    lat: 36.78,
    lng: 127.0,
    ...overrides,
  }
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost:3102/api/courses/${TEST_COURSE_ID}/album`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-access-token',
    },
    body: JSON.stringify(body),
  })
}

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/courses/[id]/album/route')
  const response = await POST(makePostRequest(body), {
    params: Promise.resolve({ id: TEST_COURSE_ID }),
  })
  const json = await response.json()
  return { status: response.status, json }
}

// ---------------------------------------------------------------------------
// Default happy-path stubs
// ---------------------------------------------------------------------------

function setDefaults() {
  insertCalled = false
  capturedStorageBucket = undefined
  capturedStorageFolder = undefined
  capturedStorageSearch = undefined

  mockGetUserResult = {
    data: { user: { id: TEST_USER_ID, email: 'rider@example.com' } },
    error: null,
  }
  mockCourseSelectResult = { data: { id: TEST_COURSE_ID }, error: null }
  mockCountResult = { data: null, error: null, count: 0 }
  mockStorageListResult = { data: [{ name: 'photo.webp' }], error: null }
  mockInsertResult = {
    data: {
      id: 'photo-1',
      course_id: TEST_COURSE_ID,
      user_id: TEST_USER_ID,
      storage_path: validBody().storagePath,
      public_url: validBody().publicUrl,
      taken_at: null,
      caption: null,
      width: null,
      height: null,
      source_exif_json: null,
      created_at: '2026-03-08T00:00:00Z',
      updated_at: '2026-03-08T00:00:00Z',
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/courses/[id]/album – storage existence check', () => {
  beforeEach(() => {
    setDefaults()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 1. Storage object exists → DB insert proceeds
  it('inserts an album photo row when the storage object exists', async () => {
    const { status, json } = await callPost(validBody())

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(json.photo.id).toBe('photo-1')
    expect(insertCalled).toBe(true)
  })

  // 2. Storage object missing (empty list) → HTTP 400, no DB row
  it('returns 400 when storage list is empty (file not found)', async () => {
    mockStorageListResult = { data: [], error: null }

    const { status, json } = await callPost(validBody())

    expect(status).toBe(400)
    expect(json.error).toContain('업로드된 사진 파일을 찾을 수 없습니다')
    expect(insertCalled).toBe(false)
  })

  // 3. Name mismatch – storage returns files but none match exactly
  it('returns 400 when storage list returns files but none match exactly', async () => {
    mockStorageListResult = {
      data: [{ name: 'photo.webp.bak' }, { name: 'other-photo.webp' }],
      error: null,
    }

    const { status, json } = await callPost(validBody())

    expect(status).toBe(400)
    expect(json.error).toContain('업로드된 사진 파일을 찾을 수 없습니다')
    expect(insertCalled).toBe(false)
  })

  // 4. Storage list API error → HTTP 400, no DB row
  it('returns 400 when storage.list() returns an error', async () => {
    mockStorageListResult = {
      data: null,
      error: { message: 'bucket not found' },
    }

    const { status, json } = await callPost(validBody())

    expect(status).toBe(400)
    expect(json.error).toContain('업로드된 사진 파일을 찾을 수 없습니다')
    expect(insertCalled).toBe(false)
  })

  // 5. Storage list returns null data without an error
  it('returns 400 when storage.list() returns null data without an error', async () => {
    mockStorageListResult = { data: null, error: null }

    const { status, json } = await callPost(validBody())

    expect(status).toBe(400)
    expect(json.error).toContain('업로드된 사진 파일을 찾을 수 없습니다')
    expect(insertCalled).toBe(false)
  })

  // 6. storagePath parsing – folder/fileName split
  it('correctly splits storagePath into folder and fileName for storage.list()', async () => {
    const folder = `${TEST_USER_ID}/${TEST_COURSE_ID}`
    const fileName = '20260308_ride.webp'
    const storagePath = `${folder}/${fileName}`

    mockStorageListResult = { data: [{ name: fileName }], error: null }

    const body = validBody({ storagePath, publicUrl: makePublicUrl(storagePath) })
    const { status } = await callPost(body)

    expect(status).toBe(200)
    expect(capturedStorageFolder).toBe(folder)
    expect(capturedStorageSearch).toBe(fileName)
  })

  // 7. Uses the correct bucket constant
  it('queries the correct storage bucket (course-album-photos)', async () => {
    await callPost(validBody())

    expect(capturedStorageBucket).toBe(COURSE_ALBUM_BUCKET)
    expect(capturedStorageBucket).toBe('course-album-photos')
  })
})
