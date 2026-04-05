/**
 * Unit tests for RegionMapModal logic.
 *
 * Scope: injectStyle helper (exported for testing) + /api/regions/[id] handler.
 * Component render tests requiring JSX are excluded due to vitest include pattern (*.test.ts only).
 *
 * injectStyle tests cover: SVG width/height replacement, style injection, preserveAspectRatio,
 * and structural integrity of the output. API handler tests cover the GET /api/regions/[id] route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must mock supabase before importing anything that depends on it
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}))

vi.mock('@/lib/profile', () => ({
  upsertProfile: vi.fn(),
}))

import { injectStyle } from '@/components/region/region-map-modal'

// ---------------------------------------------------------------------------
// injectStyle — SVG manipulation helper
// ---------------------------------------------------------------------------

const MINIMAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 750" width="800" height="750"><path d="M0 0"/></svg>`

describe('injectStyle', () => {
  it('replaces hardcoded width with 100%', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('width="100%"')
    expect(result).not.toMatch(/width="\d+"/)
  })

  it('replaces hardcoded height with auto (lets SVG size from viewBox ratio)', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('height="auto"')
    expect(result).not.toMatch(/height="\d+"/)
  })

  it('adds display:block style to <svg>', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('display:block')
  })

  it('injects <style> tag right after the opening <svg ...> tag', () => {
    const result = injectStyle(MINIMAL_SVG)
    // Style tag must appear before any path element
    const styleIdx = result.indexOf('<style>')
    const pathIdx = result.indexOf('<path')
    expect(styleIdx).toBeGreaterThan(-1)
    expect(pathIdx).toBeGreaterThan(styleIdx)
  })

  it('includes cursor-pointer rule for path elements', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('cursor: pointer')
  })

  it('includes hover fill rule with correct hex color', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('#994200')
  })

  it('does not include selected fill in SVG style (handled by React style tag)', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).not.toContain('#c85a08')
  })

  it('preserves SVG viewBox and other attributes unchanged', () => {
    const result = injectStyle(MINIMAL_SVG)
    expect(result).toContain('viewBox="0 0 800 750"')
  })

  it('does not inject a second <style> tag when called once', () => {
    const result = injectStyle(MINIMAL_SVG)
    const styleCount = (result.match(/<style>/g) ?? []).length
    expect(styleCount).toBe(1)
  })

  it('handles SVG with no width/height attributes (no replacement needed)', () => {
    const svgWithoutDimensions = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 750"><path d="M0 0"/></svg>`
    const result = injectStyle(svgWithoutDimensions)
    // Should still inject style and display:block
    expect(result).toContain('<style>')
    expect(result).toContain('display:block')
  })
})

// ---------------------------------------------------------------------------
// /api/regions/[id] — GET handler (mocked Supabase)
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase-server', () => ({
  createAnonServerClient: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      json: async () => data,
      status: init?.status ?? 200,
    }),
  },
}))

import { GET } from '@/app/api/regions/[id]/route'
import { createAnonServerClient } from '@/lib/supabase-server'

const MOCK_REGION = {
  id: 'abc-123',
  name: '경기도 수원시 장안구',
  short_name: '경기 수원시 장안구',
  code: '31111',
  level: 'sigungu',
  parent_id: 'parent-uuid',
}

function makeSupabaseMock(data: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data, error }),
        }),
      }),
    }),
  }
}

describe('GET /api/regions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns region data including code field for known ID', async () => {
    vi.mocked(createAnonServerClient).mockReturnValue(makeSupabaseMock(MOCK_REGION) as unknown as ReturnType<typeof createAnonServerClient>)

    const req = new Request('http://localhost/api/regions/abc-123')
    const params = Promise.resolve({ id: 'abc-123' })

    const response = await GET(req, { params })
    const json = await response.json()

    expect(json.id).toBe('abc-123')
    expect(json.code).toBe('31111')
    expect(json.level).toBe('sigungu')
  })

  it('returns 404 when region is not found', async () => {
    vi.mocked(createAnonServerClient).mockReturnValue(makeSupabaseMock(null, { code: 'PGRST116', message: 'no rows' }) as unknown as ReturnType<typeof createAnonServerClient>)

    const req = new Request('http://localhost/api/regions/unknown-id')
    const params = Promise.resolve({ id: 'unknown-id' })

    const response = await GET(req, { params })

    expect(response.status).toBe(404)
  })

  it('returns sido code prefix extractable from sigungu code', async () => {
    vi.mocked(createAnonServerClient).mockReturnValue(makeSupabaseMock(MOCK_REGION) as unknown as ReturnType<typeof createAnonServerClient>)

    const req = new Request('http://localhost/api/regions/abc-123')
    const params = Promise.resolve({ id: 'abc-123' })

    const response = await GET(req, { params })
    const json = await response.json()

    // GPS flow: sido code is first 2 digits of sigungu code
    const sidoCode = (json.code as string).slice(0, 2)
    expect(sidoCode).toBe('31')
  })
})
