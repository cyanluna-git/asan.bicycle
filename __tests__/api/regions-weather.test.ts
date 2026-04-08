/**
 * Integration tests for location-aware API routes:
 *   - GET /api/regions/reverse
 *   - GET /api/regions/[id]/center
 *   - GET /api/weather
 *
 * Uses real Supabase RPCs (`detect_region_by_point`, `region_centroid`) and
 * exercises the weather handler in mock mode so CI never depends on the
 * external KMA service.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET as getRegions } from '@/app/api/regions/route'
import { GET as getReverseRegion } from '@/app/api/regions/reverse/route'
import { GET as getRegionCenter } from '@/app/api/regions/[id]/center/route'
import { GET as getWeather } from '@/app/api/weather/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hasSupabaseEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const describeIfDb = hasSupabaseEnv ? describe : describe.skip

function todayKstDateStr(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function futureKstDateStr(offsetDays: number): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  kst.setUTCDate(kst.getUTCDate() + offsetDays)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Suite: /api/regions/reverse
// ---------------------------------------------------------------------------

describeIfDb('GET /api/regions/reverse', () => {
  it('Seoul coords return a region whose name contains 서울', async () => {
    const res = await getReverseRegion(
      new Request('http://localhost/api/regions/reverse?lat=37.56&lng=126.97'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; name: string } | null
    expect(body).not.toBeNull()
    expect(body!.name).toContain('서울')
  })

  it('out-of-coverage ocean coords return null without erroring', async () => {
    const res = await getReverseRegion(
      new Request('http://localhost/api/regions/reverse?lat=35.0&lng=130.0'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('missing lat/lng returns 400', async () => {
    const res = await getReverseRegion(
      new Request('http://localhost/api/regions/reverse'),
    )
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Suite: /api/regions/[id]/center
// ---------------------------------------------------------------------------

describeIfDb('GET /api/regions/[id]/center', () => {
  let sidoRegionId: string | null = null

  it('resolves a real sido region id', async () => {
    const res = await getRegions(new Request('http://localhost/api/regions?level=sido'))
    expect(res.status).toBe(200)
    const sidos = (await res.json()) as Array<{ id: string; name: string }>
    expect(sidos.length).toBeGreaterThan(0)
    sidoRegionId = sidos[0].id
  })

  it('returns {lat, lng} inside Korea bounds for a real region', async () => {
    expect(sidoRegionId).toBeTruthy()
    const res = await getRegionCenter(
      new Request(`http://localhost/api/regions/${sidoRegionId}/center`),
      { params: Promise.resolve({ id: sidoRegionId! }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { lat: number; lng: number }
    expect(body.lat).toBeGreaterThanOrEqual(33)
    expect(body.lat).toBeLessThanOrEqual(39)
    expect(body.lng).toBeGreaterThanOrEqual(124)
    expect(body.lng).toBeLessThanOrEqual(132)
  })

  it('non-existent UUID returns either 404 or the fallback center', async () => {
    const res = await getRegionCenter(
      new Request('http://localhost/api/regions/00000000-0000-0000-0000-000000000000/center'),
      { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) },
    )
    // Current handler returns 404 when the region isn't found; the (36.5, 127.0)
    // fallback only triggers when the RPC fails but the row still exists. We
    // accept either behavior — both indicate graceful handling of a missing id.
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      const body = (await res.json()) as { lat: number; lng: number }
      expect(body).toEqual({ lat: 36.5, lng: 127.0 })
    }
  })
})

// ---------------------------------------------------------------------------
// Suite: /api/weather
// ---------------------------------------------------------------------------

describe('GET /api/weather (integration)', () => {
  const originalKey = process.env.WEATHER_API_KEY

  beforeEach(() => {
    // Force mock mode — guarantees tests do not depend on the external KMA API.
    delete process.env.WEATHER_API_KEY
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.WEATHER_API_KEY = originalKey
    } else {
      delete process.env.WEATHER_API_KEY
    }
  })

  it('valid lat/lng/date returns 200 in mock mode', async () => {
    const url = `http://localhost/api/weather?lat=37.56&lng=126.97&date=${todayKstDateStr()}`
    const res = await getWeather(new Request(url))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toHaveProperty('forecasts')
    expect(body.mock).toBe(true)
  })

  it('date more than 3 days in the future returns 400, not 500', async () => {
    const url = `http://localhost/api/weather?lat=37.56&lng=126.97&date=${futureKstDateStr(4)}`
    const res = await getWeather(new Request(url))
    expect(res.status).toBe(400)
    expect(res.status).not.toBe(500)
  })
})
