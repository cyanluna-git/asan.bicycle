import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COURSE_ALBUM_BUCKET,
  MAX_COURSE_ALBUM_CAPTION_LENGTH,
  MAX_COURSE_ALBUM_IMAGE_DIMENSION,
  MIN_COURSE_ALBUM_IMAGE_DIMENSION,
} from '@/lib/course-album'

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

// ---------------------------------------------------------------------------
// Chainable builder (same pattern as course-album-storage-check.test.ts)
// ---------------------------------------------------------------------------

function chain(getTerminal: () => Record<string, unknown>) {
  const proxy: unknown = new Proxy(
    () => {},
    {
      get(_target, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => getTerminal()
        }
        const terminal = getTerminal()
        if (prop in terminal) {
          return terminal[prop]
        }
        return (..._args: unknown[]) => proxy
      },
      apply() {
        return proxy
      },
    },
  )
  return proxy
}

// ---------------------------------------------------------------------------
// Mock Supabase clients
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
      from: (_bucket: string) => ({
        list: (_folder: string, _opts: { search: string; limit: number }) => mockStorageListResult,
      }),
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
    width: 1024,
    height: 768,
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
      width: 1024,
      height: 768,
      source_exif_json: null,
      created_at: '2026-03-08T00:00:00Z',
      updated_at: '2026-03-08T00:00:00Z',
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// Tests – Caption validation
// ---------------------------------------------------------------------------

describe('POST /api/courses/[id]/album – caption validation', () => {
  beforeEach(() => {
    setDefaults()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it(`accepts caption exactly at limit (${MAX_COURSE_ALBUM_CAPTION_LENGTH} chars)`, async () => {
    const caption = 'A'.repeat(MAX_COURSE_ALBUM_CAPTION_LENGTH)
    expect(caption.length).toBe(180)

    const { status, json } = await callPost(validBody({ caption }))

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  it(`rejects caption over limit (${MAX_COURSE_ALBUM_CAPTION_LENGTH + 1} chars) with HTTP 400`, async () => {
    const caption = 'A'.repeat(MAX_COURSE_ALBUM_CAPTION_LENGTH + 1)
    expect(caption.length).toBe(181)

    const { status, json } = await callPost(validBody({ caption }))

    expect(status).toBe(400)
    expect(json.error).toContain(`${MAX_COURSE_ALBUM_CAPTION_LENGTH}`)
    expect(insertCalled).toBe(false)
  })

  it('accepts null caption (no caption)', async () => {
    const { status, json } = await callPost(validBody({ caption: null }))

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  it('accepts empty string caption (treated as no caption)', async () => {
    const { status, json } = await callPost(validBody({ caption: '' }))

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  it('accepts caption just under the limit (179 chars)', async () => {
    const caption = 'B'.repeat(MAX_COURSE_ALBUM_CAPTION_LENGTH - 1)

    const { status, json } = await callPost(validBody({ caption }))

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests – Dimension validation
// ---------------------------------------------------------------------------

describe('POST /api/courses/[id]/album – dimension validation', () => {
  beforeEach(() => {
    setDefaults()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- Boundary: accepted ---

  it(`accepts width and height at minimum boundary (${MIN_COURSE_ALBUM_IMAGE_DIMENSION})`, async () => {
    const { status, json } = await callPost(
      validBody({ width: MIN_COURSE_ALBUM_IMAGE_DIMENSION, height: MIN_COURSE_ALBUM_IMAGE_DIMENSION }),
    )

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  it(`accepts width and height at maximum boundary (${MAX_COURSE_ALBUM_IMAGE_DIMENSION})`, async () => {
    const { status, json } = await callPost(
      validBody({ width: MAX_COURSE_ALBUM_IMAGE_DIMENSION, height: MAX_COURSE_ALBUM_IMAGE_DIMENSION }),
    )

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  it('accepts width=1 with height=2048 (mixed boundaries)', async () => {
    const { status, json } = await callPost(
      validBody({ width: 1, height: 2048 }),
    )

    expect(status).toBe(200)
    expect(json).toHaveProperty('photo')
    expect(insertCalled).toBe(true)
  })

  // --- Boundary: rejected ---

  it('rejects width=0 with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ width: 0 }))

    expect(status).toBe(400)
    expect(json.error).toContain(`${MIN_COURSE_ALBUM_IMAGE_DIMENSION}`)
    expect(insertCalled).toBe(false)
  })

  it('rejects height=0 with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ height: 0 }))

    expect(status).toBe(400)
    expect(json.error).toContain(`${MIN_COURSE_ALBUM_IMAGE_DIMENSION}`)
    expect(insertCalled).toBe(false)
  })

  it('rejects negative width (-1) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ width: -1 }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects negative height (-1) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ height: -1 }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects width over maximum (2049) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ width: 2049 }))

    expect(status).toBe(400)
    expect(json.error).toContain(`${MAX_COURSE_ALBUM_IMAGE_DIMENSION}`)
    expect(insertCalled).toBe(false)
  })

  it('rejects height over maximum (2049) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ height: 2049 }))

    expect(status).toBe(400)
    expect(json.error).toContain(`${MAX_COURSE_ALBUM_IMAGE_DIMENSION}`)
    expect(insertCalled).toBe(false)
  })

  // --- Non-integer dimensions ---

  it('rejects non-integer width (1024.5) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ width: 1024.5 }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects non-integer height (768.3) with HTTP 400', async () => {
    const { status, json } = await callPost(validBody({ height: 768.3 }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  // --- Non-finite dimensions ---

  it('rejects Infinity width with HTTP 400', async () => {
    const { status } = await callPost(validBody({ width: Infinity }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects NaN height with HTTP 400', async () => {
    const { status } = await callPost(validBody({ height: NaN }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  // --- Missing dimensions ---

  it('rejects missing width (undefined) with HTTP 400', async () => {
    const body = validBody()
    delete (body as Record<string, unknown>).width

    const { status } = await callPost(body)

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects missing height (undefined) with HTTP 400', async () => {
    const body = validBody()
    delete (body as Record<string, unknown>).height

    const { status } = await callPost(body)

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects null width with HTTP 400', async () => {
    const { status } = await callPost(validBody({ width: null }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects null height with HTTP 400', async () => {
    const { status } = await callPost(validBody({ height: null }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })

  it('rejects string width with HTTP 400', async () => {
    const { status } = await callPost(validBody({ width: '1024' }))

    expect(status).toBe(400)
    expect(insertCalled).toBe(false)
  })
})
