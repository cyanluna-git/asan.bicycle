import { describe, it, expect } from 'vitest'
import {
  convertLatLngToGrid,
  resolveBaseDateTime,
  isGridInRange,
  generateMockForecast,
} from '@/lib/weather'

// ---------------------------------------------------------------------------
// convertLatLngToGrid
// ---------------------------------------------------------------------------

describe('convertLatLngToGrid', () => {
  it('converts Asan (36.78, 127.00) → nx=60, ny=110 (±1)', () => {
    const { nx, ny } = convertLatLngToGrid(36.78, 127.0)
    expect(nx).toBeCloseTo(60, 0)
    expect(ny).toBeCloseTo(110, 0)
  })

  it('converts Seoul (37.57, 126.97) → nx=60, ny=127 (±1)', () => {
    const { nx, ny } = convertLatLngToGrid(37.57, 126.97)
    expect(nx).toBeCloseTo(60, 0)
    expect(ny).toBeCloseTo(127, 0)
  })

  it('converts Busan (35.18, 129.08) → nx=98, ny=76 (±1)', () => {
    const { nx, ny } = convertLatLngToGrid(35.18, 129.08)
    expect(nx).toBeCloseTo(98, 0)
    expect(ny).toBeCloseTo(76, 0)
  })

  it('converts Daejeon (36.35, 127.38) → nx=67, ny=100 (±1)', () => {
    const { nx, ny } = convertLatLngToGrid(36.35, 127.38)
    expect(nx).toBeCloseTo(67, 0)
    expect(ny).toBeCloseTo(100, 0)
  })

  it('returns integer values for nx and ny', () => {
    const { nx, ny } = convertLatLngToGrid(36.78, 127.0)
    expect(Number.isInteger(nx)).toBe(true)
    expect(Number.isInteger(ny)).toBe(true)
  })

  it('returns consistent result for same input (deterministic)', () => {
    const a = convertLatLngToGrid(36.78, 127.0)
    const b = convertLatLngToGrid(36.78, 127.0)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// resolveBaseDateTime
// ---------------------------------------------------------------------------

describe('resolveBaseDateTime', () => {
  // The function uses Date#getHours / getMinutes (local time).
  // Tests create dates with local hours matching KST scenario values.

  it('at 05:15 → uses base time 0500', () => {
    // bufferedMinutes = 5*60+15-10 = 305 >= 0500 (300)
    const date = new Date(2026, 3, 2, 5, 15, 0) // Apr 2, 2026
    const { baseDate, baseTime } = resolveBaseDateTime(date)
    expect(baseTime).toBe('0500')
    expect(baseDate).toBe('20260402')
  })

  it('at 01:30 → falls back to previous day 2300', () => {
    // bufferedMinutes = 1*60+30-10 = 80 < 0200 (120) → rollover to prev day
    const date = new Date(2026, 3, 2, 1, 30, 0) // Apr 2, 2026
    const { baseDate, baseTime } = resolveBaseDateTime(date)
    expect(baseTime).toBe('2300')
    expect(baseDate).toBe('20260401') // Apr 1, 2026
  })

  it('at 05:05 → within 10-min buffer, falls back to 0200', () => {
    // bufferedMinutes = 5*60+5-10 = 295 < 0500 (300), but >= 0200 (120)
    const date = new Date(2026, 3, 2, 5, 5, 0) // Apr 2, 2026
    const { baseDate, baseTime } = resolveBaseDateTime(date)
    expect(baseTime).toBe('0200')
    expect(baseDate).toBe('20260402')
  })

  it('at 14:30 → uses base time 1400', () => {
    // bufferedMinutes = 14*60+30-10 = 860 >= 1400 (840)
    const date = new Date(2026, 3, 2, 14, 30, 0) // Apr 2, 2026
    const { baseDate, baseTime } = resolveBaseDateTime(date)
    expect(baseTime).toBe('1400')
    expect(baseDate).toBe('20260402')
  })

  it('baseDate has format YYYYMMDD (8 digits)', () => {
    const date = new Date(2026, 3, 2, 12, 0, 0)
    const { baseDate } = resolveBaseDateTime(date)
    expect(baseDate).toMatch(/^\d{8}$/)
  })

  it('baseTime is one of the valid KMA announcement times', () => {
    const validTimes = new Set(['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'])
    const date = new Date(2026, 3, 2, 9, 0, 0)
    const { baseTime } = resolveBaseDateTime(date)
    expect(validTimes.has(baseTime)).toBe(true)
  })

  it('at exactly 02:10 → uses base time 0200 (just past buffer)', () => {
    // bufferedMinutes = 2*60+10-10 = 120 = 0200 boundary exactly
    const date = new Date(2026, 3, 2, 2, 10, 0)
    const { baseTime } = resolveBaseDateTime(date)
    expect(baseTime).toBe('0200')
  })

  it('at 02:09 → still in buffer, falls back to prev day 2300', () => {
    // bufferedMinutes = 2*60+9-10 = 119 < 120 (0200)
    const date = new Date(2026, 3, 2, 2, 9, 0)
    const { baseTime, baseDate } = resolveBaseDateTime(date)
    expect(baseTime).toBe('2300')
    expect(baseDate).toBe('20260401')
  })
})

// ---------------------------------------------------------------------------
// isGridInRange
// ---------------------------------------------------------------------------

describe('isGridInRange', () => {
  it('returns true for valid grid (60, 120)', () => {
    expect(isGridInRange(60, 120)).toBe(true)
  })

  it('returns false for (0, 0) — below minimum', () => {
    expect(isGridInRange(0, 0)).toBe(false)
  })

  it('returns false for (200, 300) — above maximum', () => {
    expect(isGridInRange(200, 300)).toBe(false)
  })

  it('returns true for lower boundary (1, 1)', () => {
    expect(isGridInRange(1, 1)).toBe(true)
  })

  it('returns true for upper boundary (149, 253)', () => {
    expect(isGridInRange(149, 253)).toBe(true)
  })

  it('returns false when nx is 0 (below min)', () => {
    expect(isGridInRange(0, 100)).toBe(false)
  })

  it('returns false when nx is 150 (above max)', () => {
    expect(isGridInRange(150, 100)).toBe(false)
  })

  it('returns false when ny is 0 (below min)', () => {
    expect(isGridInRange(60, 0)).toBe(false)
  })

  it('returns false when ny is 254 (above max)', () => {
    expect(isGridInRange(60, 254)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateMockForecast
// ---------------------------------------------------------------------------

describe('generateMockForecast', () => {
  const lat = 36.78
  const lng = 127.0
  const date = new Date(2026, 3, 2, 12, 0, 0)

  it('returns a WeatherForecastResponse with mock=true', () => {
    const result = generateMockForecast(lat, lng, date)
    expect(result.mock).toBe(true)
  })

  it('includes grid with valid nx and ny from given coordinates', () => {
    const result = generateMockForecast(lat, lng, date)
    expect(result.grid.nx).toBeGreaterThanOrEqual(1)
    expect(result.grid.ny).toBeGreaterThanOrEqual(1)
    expect(isGridInRange(result.grid.nx, result.grid.ny)).toBe(true)
  })

  it('returns non-empty forecasts array', () => {
    const result = generateMockForecast(lat, lng, date)
    expect(Array.isArray(result.forecasts)).toBe(true)
    expect(result.forecasts.length).toBeGreaterThan(0)
  })

  it('generates 3 days × 8 slots (24h / 3h = 8 per day) = 24 entries', () => {
    const result = generateMockForecast(lat, lng, date)
    expect(result.forecasts).toHaveLength(24)
  })

  it('all temperatures are within realistic range (-10 to 45°C)', () => {
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(f.temperature).toBeGreaterThanOrEqual(-10)
      expect(f.temperature).toBeLessThanOrEqual(45)
    }
  })

  it('all wind speeds are non-negative', () => {
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(f.windSpeed).toBeGreaterThanOrEqual(0)
    }
  })

  it('all precipitation probabilities are 0–100', () => {
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(f.precipitationProbability).toBeGreaterThanOrEqual(0)
      expect(f.precipitationProbability).toBeLessThanOrEqual(100)
    }
  })

  it('each forecast has a valid datetime string (ISO-like)', () => {
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(f.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    }
  })

  it('forecasts contain required fields with correct types', () => {
    const result = generateMockForecast(lat, lng, date)
    const f = result.forecasts[0]
    expect(typeof f.datetime).toBe('string')
    expect(typeof f.temperature).toBe('number')
    expect(typeof f.windSpeed).toBe('number')
    expect(typeof f.windDirection).toBe('number')
    expect(typeof f.precipitationProbability).toBe('number')
    expect(typeof f.skyCondition).toBe('number')
    expect(typeof f.precipitationType).toBe('number')
  })

  it('all sky conditions are valid values (1, 3, or 4)', () => {
    const validSkyConditions = new Set([1, 3, 4])
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(validSkyConditions.has(f.skyCondition)).toBe(true)
    }
  })

  it('all precipitation types are valid values (0, 1, 2, 3, 5, 6, or 7)', () => {
    const validTypes = new Set([0, 1, 2, 3, 5, 6, 7])
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(validTypes.has(f.precipitationType)).toBe(true)
    }
  })

  it('baseDate and baseTime fields are present', () => {
    const result = generateMockForecast(lat, lng, date)
    expect(result.baseDate).toMatch(/^\d{8}$/)
    expect(typeof result.baseTime).toBe('string')
    expect(result.baseTime).toHaveLength(4)
  })

  it('wind directions are within 0–360 degrees', () => {
    const result = generateMockForecast(lat, lng, date)
    for (const f of result.forecasts) {
      expect(f.windDirection).toBeGreaterThanOrEqual(0)
      expect(f.windDirection).toBeLessThanOrEqual(360)
    }
  })
})
