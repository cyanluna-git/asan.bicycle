import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/weather/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(params: Record<string, string>): Request {
  const url = new URL('http://localhost/api/weather')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url.toString())
}

async function parseJson(response: Response): Promise<unknown> {
  return response.json()
}

// Use a date that is "today" relative to the test run so the 3-day-future
// check always passes.  We freeze time to a known KST morning so the diff
// calculation is deterministic.
function todayDateStr(): string {
  const now = new Date()
  const koreaMs = now.getTime() + 9 * 60 * 60 * 1000
  const kst = new Date(koreaMs)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GET /api/weather', () => {
  const originalEnv = process.env.WEATHER_API_KEY

  beforeEach(() => {
    // Ensure mock mode (no API key) so we don't call external services
    delete process.env.WEATHER_API_KEY
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WEATHER_API_KEY = originalEnv
    } else {
      delete process.env.WEATHER_API_KEY
    }
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('valid request with lat/lng/date returns 200 with forecasts', async () => {
    const date = todayDateStr()
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00', date }))
    expect(res.status).toBe(200)

    const body = (await parseJson(res)) as Record<string, unknown>
    expect(body).toHaveProperty('forecasts')
    expect(Array.isArray(body.forecasts)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Missing / invalid parameters
  // -------------------------------------------------------------------------

  it('missing lat returns 400', async () => {
    const res = await GET(makeRequest({ lng: '127.00', date: todayDateStr() }))
    expect(res.status).toBe(400)
  })

  it('missing lng returns 400', async () => {
    const res = await GET(makeRequest({ lat: '36.78', date: todayDateStr() }))
    expect(res.status).toBe(400)
  })

  it('missing date returns 400', async () => {
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00' }))
    expect(res.status).toBe(400)
  })

  it('invalid lat (not a number) returns 400', async () => {
    const res = await GET(
      makeRequest({ lat: 'abc', lng: '127.00', date: todayDateStr() }),
    )
    expect(res.status).toBe(400)
  })

  it('invalid lng (not a number) returns 400', async () => {
    const res = await GET(
      makeRequest({ lat: '36.78', lng: 'xyz', date: todayDateStr() }),
    )
    expect(res.status).toBe(400)
  })

  it('invalid date format returns 400', async () => {
    const res = await GET(
      makeRequest({ lat: '36.78', lng: '127.00', date: '04-02-2026' }),
    )
    expect(res.status).toBe(400)
  })

  it('date more than 3 days in future returns 400', async () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const y = future.getFullYear()
    const m = String(future.getMonth() + 1).padStart(2, '0')
    const d = String(future.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    const res = await GET(
      makeRequest({ lat: '36.78', lng: '127.00', date: dateStr }),
    )
    expect(res.status).toBe(400)
  })

  it('out-of-range grid coordinates (lat=0, lng=0) returns 400', async () => {
    const res = await GET(
      makeRequest({ lat: '0', lng: '0', date: todayDateStr() }),
    )
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------

  it('response has correct top-level structure', async () => {
    const date = todayDateStr()
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00', date }))
    expect(res.status).toBe(200)

    const body = (await parseJson(res)) as Record<string, unknown>
    expect(body).toHaveProperty('grid')
    expect(body).toHaveProperty('baseDate')
    expect(body).toHaveProperty('baseTime')
    expect(body).toHaveProperty('forecasts')
    expect(body).toHaveProperty('mock')
  })

  it('mock mode: returns mock=true when WEATHER_API_KEY is not set', async () => {
    const date = todayDateStr()
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00', date }))
    const body = (await parseJson(res)) as Record<string, unknown>
    expect(body.mock).toBe(true)
  })

  it('each forecast item has required fields', async () => {
    const date = todayDateStr()
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00', date }))
    const body = (await parseJson(res)) as {
      forecasts: Record<string, unknown>[]
    }

    expect(body.forecasts.length).toBeGreaterThan(0)

    for (const f of body.forecasts) {
      expect(f).toHaveProperty('datetime')
      expect(f).toHaveProperty('temperature')
      expect(f).toHaveProperty('windSpeed')
      expect(f).toHaveProperty('windDirection')
      expect(f).toHaveProperty('precipitationProbability')
      expect(f).toHaveProperty('skyCondition')
      expect(f).toHaveProperty('precipitationType')
    }
  })

  it('grid contains valid nx and ny', async () => {
    const date = todayDateStr()
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00', date }))
    const body = (await parseJson(res)) as {
      grid: { nx: number; ny: number }
    }

    expect(body.grid.nx).toBeGreaterThanOrEqual(1)
    expect(body.grid.nx).toBeLessThanOrEqual(149)
    expect(body.grid.ny).toBeGreaterThanOrEqual(1)
    expect(body.grid.ny).toBeLessThanOrEqual(253)
  })

  it('error response has { error } field', async () => {
    const res = await GET(makeRequest({ lat: '36.78', lng: '127.00' }))
    expect(res.status).toBe(400)

    const body = (await parseJson(res)) as Record<string, unknown>
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
  })
})
