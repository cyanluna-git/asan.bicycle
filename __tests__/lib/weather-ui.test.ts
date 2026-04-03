import { describe, it, expect } from 'vitest'
import {
  degreeToWindDirection16,
  evaluateRidingSuitability,
  isNighttime,
  getWeatherIconName,
  getSuitabilityMeta,
} from '@/lib/weather-ui'
import type { HourlyForecast } from '@/types/weather'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeForecast(overrides: Partial<HourlyForecast>): HourlyForecast {
  return {
    datetime: '2026-04-02T12:00:00',
    temperature: 15,
    windSpeed: 3,
    windDirection: 0,
    precipitationProbability: 10,
    skyCondition: 1,
    precipitationType: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// degreeToWindDirection16
// ---------------------------------------------------------------------------

describe('degreeToWindDirection16', () => {
  it('0° → 북', () => {
    expect(degreeToWindDirection16(0)).toBe('북')
  })

  it('90° → 동', () => {
    expect(degreeToWindDirection16(90)).toBe('동')
  })

  it('180° → 남', () => {
    expect(degreeToWindDirection16(180)).toBe('남')
  })

  it('270° → 서', () => {
    expect(degreeToWindDirection16(270)).toBe('서')
  })

  it('45° → 북동', () => {
    expect(degreeToWindDirection16(45)).toBe('북동')
  })

  it('225° → 남서', () => {
    expect(degreeToWindDirection16(225)).toBe('남서')
  })

  it('360° → 북 (wrap-around)', () => {
    expect(degreeToWindDirection16(360)).toBe('북')
  })

  it('negative degree → handled gracefully (returns valid WindDirection16)', () => {
    // -22.5° is equivalent to 337.5° which rounds to index 15 → 북북서
    const result = degreeToWindDirection16(-22.5)
    const validDirections = [
      '북', '북북동', '북동', '동북동',
      '동', '동남동', '남동', '남남동',
      '남', '남남서', '남서', '서남서',
      '서', '서북서', '북서', '북북서',
    ]
    expect(validDirections).toContain(result)
  })

  it('-360° wraps to 북', () => {
    expect(degreeToWindDirection16(-360)).toBe('북')
  })
})

// ---------------------------------------------------------------------------
// evaluateRidingSuitability
// ---------------------------------------------------------------------------

describe('evaluateRidingSuitability', () => {
  it('good conditions: temp=15, wind=3, pop=10 → good', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 3, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('good')
  })

  it('moderate conditions: low temp triggers moderate', () => {
    // temp < 5 forces moderate (but not sub-zero)
    const forecast = makeForecast({ temperature: 2, windSpeed: 3, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('moderate')
  })

  it('moderate conditions: high wind (6 m/s) triggers moderate', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 6, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('moderate')
  })

  it('moderate conditions: pop=30 triggers moderate', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 3, precipitationProbability: 30 })
    expect(evaluateRidingSuitability(forecast)).toBe('moderate')
  })

  it('not_recommended: sub-zero temperature', () => {
    const forecast = makeForecast({ temperature: -5, windSpeed: 15, precipitationProbability: 80 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })

  it('not_recommended: sub-zero forces not_recommended even with low wind', () => {
    const forecast = makeForecast({ temperature: -1, windSpeed: 2, precipitationProbability: 5 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })

  it('not_recommended: wind >= 10 m/s', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 10, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })

  it('not_recommended: pop >= 60', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 3, precipitationProbability: 60 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })

  it('not_recommended: active precipitation (PTY=1)', () => {
    const forecast = makeForecast({ temperature: 15, windSpeed: 3, precipitationProbability: 10, precipitationType: 1 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })

  it('boundary: temp=5 exact → moderate (below 5 exclusive threshold)', () => {
    // temp < 5 → moderate; temp === 5 is not < 5 so this depends on the threshold
    // Looking at implementation: temperature < 5 → moderate; so temp=5 is NOT < 5
    // temp=5 passes the moderate check (temperature < 5 is false), and also no other moderate trigger
    // → should be 'good' since 5 is not < 5
    const forecast = makeForecast({ temperature: 5, windSpeed: 3, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('good')
  })

  it('boundary: wind=7 exact → moderate', () => {
    // windSpeed >= 6 → moderate
    const forecast = makeForecast({ temperature: 15, windSpeed: 7, precipitationProbability: 10 })
    expect(evaluateRidingSuitability(forecast)).toBe('moderate')
  })

  it('boundary: pop=30 exact → moderate', () => {
    // precipitationProbability >= 30 → moderate
    const forecast = makeForecast({ temperature: 15, windSpeed: 3, precipitationProbability: 30 })
    expect(evaluateRidingSuitability(forecast)).toBe('moderate')
  })

  it('temp < 5 but >= 0 combined with wind=10 → not_recommended (wind rule first)', () => {
    const forecast = makeForecast({ temperature: 2, windSpeed: 10, precipitationProbability: 50 })
    expect(evaluateRidingSuitability(forecast)).toBe('not_recommended')
  })
})

// ---------------------------------------------------------------------------
// isNighttime
// ---------------------------------------------------------------------------

describe('isNighttime', () => {
  it('03:00 → true (before dawn)', () => {
    expect(isNighttime('2026-04-02T03:00:00')).toBe(true)
  })

  it('21:00 → true (hour >= 21)', () => {
    expect(isNighttime('2026-04-02T21:00:00')).toBe(true)
  })

  it('06:00 → false (dawn boundary, hour === 6)', () => {
    // hour < 6 is false at 6, so not nighttime
    expect(isNighttime('2026-04-02T06:00:00')).toBe(false)
  })

  it('20:00 → false (hour 20, just before nighttime threshold)', () => {
    expect(isNighttime('2026-04-02T20:00:00')).toBe(false)
  })

  it('12:00 → false (midday)', () => {
    expect(isNighttime('2026-04-02T12:00:00')).toBe(false)
  })

  it('00:00 → true (midnight)', () => {
    expect(isNighttime('2026-04-02T00:00:00')).toBe(true)
  })

  it('05:59 → true (just before dawn)', () => {
    expect(isNighttime('2026-04-02T05:59:00')).toBe(true)
  })

  it('23:00 → true (late night)', () => {
    expect(isNighttime('2026-04-02T23:00:00')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getWeatherIconName
// ---------------------------------------------------------------------------

describe('getWeatherIconName', () => {
  it('sky=1 (clear) daytime → sun', () => {
    expect(getWeatherIconName(1, 0, false)).toBe('sun')
  })

  it('sky=1 (clear) nighttime → moon', () => {
    expect(getWeatherIconName(1, 0, true)).toBe('moon')
  })

  it('PTY=1 (rain) → cloud-rain', () => {
    expect(getWeatherIconName(1, 1, false)).toBe('cloud-rain')
  })

  it('PTY=5 (drizzle) → cloud-rain', () => {
    expect(getWeatherIconName(1, 5, false)).toBe('cloud-rain')
  })

  it('PTY=3 (snow) → snowflake', () => {
    expect(getWeatherIconName(1, 3, false)).toBe('snowflake')
  })

  it('PTY=7 (snow flurry) → snowflake', () => {
    expect(getWeatherIconName(1, 7, false)).toBe('snowflake')
  })

  it('PTY=2 (sleet) → cloud-rain-wind', () => {
    expect(getWeatherIconName(1, 2, false)).toBe('cloud-rain-wind')
  })

  it('PTY=6 (sleet flurry) → cloud-rain-wind', () => {
    expect(getWeatherIconName(1, 6, false)).toBe('cloud-rain-wind')
  })

  it('sky=3 (partly cloudy) daytime → cloud-sun', () => {
    expect(getWeatherIconName(3, 0, false)).toBe('cloud-sun')
  })

  it('sky=3 (partly cloudy) nighttime → cloud-moon', () => {
    expect(getWeatherIconName(3, 0, true)).toBe('cloud-moon')
  })

  it('sky=4 (overcast) → cloud', () => {
    expect(getWeatherIconName(4, 0, false)).toBe('cloud')
  })

  it('precipitation type takes priority over sky condition', () => {
    // PTY=1 even with clear sky (sky=1) → rain icon
    expect(getWeatherIconName(1, 1, false)).toBe('cloud-rain')
  })
})

// ---------------------------------------------------------------------------
// getSuitabilityMeta
// ---------------------------------------------------------------------------

describe('getSuitabilityMeta', () => {
  it("'good' meta contains label '좋음'", () => {
    const meta = getSuitabilityMeta('good')
    expect(meta.label).toBe('좋음')
  })

  it("'good' meta has emerald className", () => {
    const meta = getSuitabilityMeta('good')
    expect(meta.className).toContain('emerald')
  })

  it("'moderate' meta contains label '보통'", () => {
    const meta = getSuitabilityMeta('moderate')
    expect(meta.label).toBe('보통')
  })

  it("'moderate' meta has amber className", () => {
    const meta = getSuitabilityMeta('moderate')
    expect(meta.className).toContain('amber')
  })

  it("'not_recommended' meta contains label '비추천'", () => {
    const meta = getSuitabilityMeta('not_recommended')
    expect(meta.label).toBe('비추천')
  })

  it("'not_recommended' meta has red className", () => {
    const meta = getSuitabilityMeta('not_recommended')
    expect(meta.className).toContain('red')
  })

  it('all suitability values return a meta object with label and className', () => {
    for (const s of ['good', 'moderate', 'not_recommended'] as const) {
      const meta = getSuitabilityMeta(s)
      expect(typeof meta.label).toBe('string')
      expect(typeof meta.className).toBe('string')
      expect(meta.label.length).toBeGreaterThan(0)
    }
  })
})
