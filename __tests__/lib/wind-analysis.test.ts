import { describe, it, expect } from 'vitest'
import {
  calculateBearing,
  classifyWind,
  buildWindSegments,
  buildTimeAwareWindSegments,
  summarizeWind,
  buildWindMapOverlays,
  buildWeatherMapPoints,
} from '@/lib/wind-analysis'
import type { WindSegment } from '@/lib/wind-analysis'
import type { RouteGeoJSON } from '@/types/course'
import type { HourlyForecast } from '@/types/weather'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRoute(coords: [number, number][]): RouteGeoJSON {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      },
    ],
  }
}

function makeSegment(
  startKm: number,
  endKm: number,
  classification: WindSegment['classification'],
): WindSegment {
  return {
    startKm,
    endKm,
    classification,
    effectiveSpeed: 0,
    color: '#000',
  }
}

// ---------------------------------------------------------------------------
// calculateBearing
// ---------------------------------------------------------------------------

describe('calculateBearing', () => {
  it('due north (0°): from (0,0) to (1,0)', () => {
    const bearing = calculateBearing(0, 0, 1, 0)
    expect(bearing).toBeCloseTo(0, 0)
  })

  it('due east (90°): from (0,0) to (0,1)', () => {
    const bearing = calculateBearing(0, 0, 0, 1)
    expect(bearing).toBeCloseTo(90, 0)
  })

  it('due south (180°): from (1,0) to (0,0)', () => {
    const bearing = calculateBearing(1, 0, 0, 0)
    expect(bearing).toBeCloseTo(180, 0)
  })

  it('due west (270°): from (0,1) to (0,0)', () => {
    const bearing = calculateBearing(0, 1, 0, 0)
    expect(bearing).toBeCloseTo(270, 0)
  })

  it('returns a value in [0, 360)', () => {
    const b1 = calculateBearing(0, 0, 1, 0)
    const b2 = calculateBearing(1, 0, 0, 0)
    expect(b1).toBeGreaterThanOrEqual(0)
    expect(b1).toBeLessThan(360)
    expect(b2).toBeGreaterThanOrEqual(0)
    expect(b2).toBeLessThan(360)
  })
})

// ---------------------------------------------------------------------------
// classifyWind
// ---------------------------------------------------------------------------

describe('classifyWind', () => {
  it('rider heading north (0°), wind from north (0°) → headwind', () => {
    expect(classifyWind(0, 0)).toBe('headwind')
  })

  it('rider heading north (0°), wind from south (180°) → tailwind', () => {
    expect(classifyWind(0, 180)).toBe('tailwind')
  })

  it('rider heading north (0°), wind from east (90°) → crosswind', () => {
    expect(classifyWind(0, 90)).toBe('crosswind')
  })

  it('rider heading east (90°), wind from west (270°) → tailwind', () => {
    expect(classifyWind(90, 270)).toBe('tailwind')
  })

  it('rider heading north (0°), wind from west (270°) → crosswind', () => {
    expect(classifyWind(0, 270)).toBe('crosswind')
  })

  it('boundary exactly 30° → headwind', () => {
    // diff == 30 → still headwind (diff <= 30)
    expect(classifyWind(0, 30)).toBe('headwind')
  })

  it('boundary exactly 31° → crosswind (just over headwind threshold)', () => {
    expect(classifyWind(0, 31)).toBe('crosswind')
  })

  it('boundary exactly 150° → tailwind', () => {
    // diff == 150 → tailwind (diff >= 150)
    expect(classifyWind(0, 150)).toBe('tailwind')
  })

  it('boundary exactly 149° → crosswind (just under tailwind threshold)', () => {
    expect(classifyWind(0, 149)).toBe('crosswind')
  })

  it('wind from exact opposite of rider bearing (180° diff) → tailwind', () => {
    expect(classifyWind(45, 225)).toBe('tailwind')
  })

  it('all wind classifications are valid strings', () => {
    const valid = new Set(['headwind', 'tailwind', 'crosswind'])
    for (let riding = 0; riding < 360; riding += 15) {
      for (let wind = 0; wind < 360; wind += 15) {
        expect(valid.has(classifyWind(riding, wind))).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// buildWindSegments
// ---------------------------------------------------------------------------

describe('buildWindSegments', () => {
  it('null route → empty array', () => {
    expect(buildWindSegments(null, 0, 10)).toEqual([])
  })

  it('undefined route → empty array', () => {
    expect(buildWindSegments(undefined, 0, 10)).toEqual([])
  })

  it('windSpeed = 0 → empty array', () => {
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    expect(buildWindSegments(route, 0, 0)).toEqual([])
  })

  it('windSpeed < 0 → empty array', () => {
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    expect(buildWindSegments(route, 180, -5)).toEqual([])
  })

  it('route with only 1 coordinate → empty array', () => {
    const route = makeRoute([[127.0, 36.78]])
    expect(buildWindSegments(route, 180, 10)).toEqual([])
  })

  it('empty features array → empty array', () => {
    const route: RouteGeoJSON = { type: 'FeatureCollection', features: [] }
    expect(buildWindSegments(route, 180, 10)).toEqual([])
  })

  it('simple 2-point route → 1 segment', () => {
    // Two distinct coordinates
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    const segments = buildWindSegments(route, 180, 10)
    expect(segments).toHaveLength(1)
  })

  it('3-point route → 2 segments', () => {
    const route = makeRoute([
      [127.0, 36.78],
      [127.01, 36.79],
      [127.02, 36.80],
    ])
    const segments = buildWindSegments(route, 180, 10)
    expect(segments).toHaveLength(2)
  })

  it('segment has required fields', () => {
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    const [seg] = buildWindSegments(route, 180, 10)
    expect(typeof seg.startKm).toBe('number')
    expect(typeof seg.endKm).toBe('number')
    expect(typeof seg.effectiveSpeed).toBe('number')
    expect(typeof seg.color).toBe('string')
    expect(['headwind', 'tailwind', 'crosswind']).toContain(seg.classification)
  })

  it('segment endKm > startKm', () => {
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    const [seg] = buildWindSegments(route, 180, 10)
    expect(seg.endKm).toBeGreaterThan(seg.startKm)
  })

  it('first segment startKm is 0', () => {
    const route = makeRoute([[127.0, 36.78], [127.01, 36.79]])
    const [seg] = buildWindSegments(route, 180, 10)
    expect(seg.startKm).toBe(0)
  })

  it('non-LineString features are skipped', () => {
    const route: RouteGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          // @ts-expect-error intentional wrong geometry type for test
          geometry: { type: 'Point', coordinates: [127.0, 36.78] },
        },
      ],
    }
    expect(buildWindSegments(route, 180, 10)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// summarizeWind
// ---------------------------------------------------------------------------

describe('summarizeWind', () => {
  it('empty segments → all zeros', () => {
    expect(summarizeWind([])).toEqual({
      headwindPercent: 0,
      tailwindPercent: 0,
      crosswindPercent: 0,
    })
  })

  it('all headwind → 100% headwind, 0% others', () => {
    const segments: WindSegment[] = [
      makeSegment(0, 5, 'headwind'),
      makeSegment(5, 10, 'headwind'),
    ]
    const summary = summarizeWind(segments)
    expect(summary.headwindPercent).toBe(100)
    expect(summary.tailwindPercent).toBe(0)
    expect(summary.crosswindPercent).toBe(0)
  })

  it('all tailwind → 100% tailwind, 0% others', () => {
    const segments: WindSegment[] = [makeSegment(0, 10, 'tailwind')]
    const summary = summarizeWind(segments)
    expect(summary.tailwindPercent).toBe(100)
    expect(summary.headwindPercent).toBe(0)
    expect(summary.crosswindPercent).toBe(0)
  })

  it('all crosswind → 100% crosswind, 0% others', () => {
    const segments: WindSegment[] = [makeSegment(0, 10, 'crosswind')]
    const summary = summarizeWind(segments)
    expect(summary.crosswindPercent).toBe(100)
    expect(summary.headwindPercent).toBe(0)
    expect(summary.tailwindPercent).toBe(0)
  })

  it('mixed segments: percentages sum to 100', () => {
    const segments: WindSegment[] = [
      makeSegment(0, 4, 'headwind'),   // 4km
      makeSegment(4, 7, 'tailwind'),   // 3km
      makeSegment(7, 10, 'crosswind'), // 3km
    ]
    const { headwindPercent, tailwindPercent, crosswindPercent } = summarizeWind(segments)
    expect(headwindPercent + tailwindPercent + crosswindPercent).toBe(100)
  })

  it('mixed 50/50 headwind/tailwind', () => {
    const segments: WindSegment[] = [
      makeSegment(0, 5, 'headwind'),
      makeSegment(5, 10, 'tailwind'),
    ]
    const summary = summarizeWind(segments)
    expect(summary.headwindPercent).toBe(50)
    expect(summary.tailwindPercent).toBe(50)
    expect(summary.crosswindPercent).toBe(0)
  })

  it('returns integer percentages (Math.round)', () => {
    const segments: WindSegment[] = [
      makeSegment(0, 1, 'headwind'),
      makeSegment(1, 4, 'tailwind'),
    ]
    const { headwindPercent, tailwindPercent, crosswindPercent } = summarizeWind(segments)
    expect(Number.isInteger(headwindPercent)).toBe(true)
    expect(Number.isInteger(tailwindPercent)).toBe(true)
    expect(Number.isInteger(crosswindPercent)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers for time-aware tests
// ---------------------------------------------------------------------------

function makeForecast(
  isoDatetime: string,
  windDirection: number,
  windSpeed: number,
): HourlyForecast {
  return {
    datetime: isoDatetime,
    temperature: 15,
    windSpeed,
    windDirection,
    precipitationProbability: 0,
    skyCondition: 1,
    precipitationType: 0,
  }
}

// ---------------------------------------------------------------------------
// buildTimeAwareWindSegments
// ---------------------------------------------------------------------------

describe('buildTimeAwareWindSegments', () => {
  // Two points ~1.1 km apart (roughly): lng/lat chosen so bearing ≈ north-east
  // We use two very distinct wind directions and two forecasts 1 hour apart,
  // then ensure each segment picks the forecast whose time is closest to arrival.

  it('empty route → empty array', () => {
    const forecasts = [makeForecast('2026-04-02T07:00', 180, 5)]
    const route: RouteGeoJSON = { type: 'FeatureCollection', features: [] }
    expect(buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', 20)).toEqual([])
  })

  it('null route → empty array', () => {
    const forecasts = [makeForecast('2026-04-02T07:00', 180, 5)]
    expect(buildTimeAwareWindSegments(null, forecasts, '2026-04-02T07:00', 20)).toEqual([])
  })

  it('avgSpeed <= 0 → empty array', () => {
    const route = makeRoute([[127.0, 37.0], [127.01, 37.01]])
    const forecasts = [makeForecast('2026-04-02T07:00', 180, 5)]
    expect(buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', 0)).toEqual([])
    expect(buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', -10)).toEqual([])
  })

  it('empty forecasts → empty array', () => {
    const route = makeRoute([[127.0, 37.0], [127.01, 37.01]])
    expect(buildTimeAwareWindSegments(route, [], '2026-04-02T07:00', 20)).toEqual([])
  })

  it('single forecast → all segments use the same wind', () => {
    // 3-point route giving 2 segments
    const route = makeRoute([
      [127.0, 37.0],
      [127.01, 37.01],
      [127.02, 37.02],
    ])
    const forecasts = [makeForecast('2026-04-02T07:00', 180, 8)]
    const segments = buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', 20)
    expect(segments.length).toBeGreaterThan(0)
    // Every segment should derive classification from windDirection=180 (tailwind
    // when riding roughly north-east at ~45°, diff ≈ 135° which is crosswind,
    // but the key assertion is they all share the same classification and color)
    const firstClassification = segments[0].classification
    for (const seg of segments) {
      expect(seg.classification).toBe(firstClassification)
    }
  })

  it('2-point route returns exactly 1 segment', () => {
    const route = makeRoute([[127.0, 37.0], [127.01, 37.01]])
    const forecasts = [makeForecast('2026-04-02T07:00', 0, 5)]
    const segments = buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', 20)
    expect(segments).toHaveLength(1)
  })

  it('segment has all required fields', () => {
    const route = makeRoute([[127.0, 37.0], [127.01, 37.01]])
    const forecasts = [makeForecast('2026-04-02T07:00', 180, 5)]
    const [seg] = buildTimeAwareWindSegments(route, forecasts, '2026-04-02T07:00', 20)
    expect(typeof seg.startKm).toBe('number')
    expect(typeof seg.endKm).toBe('number')
    expect(typeof seg.effectiveSpeed).toBe('number')
    expect(typeof seg.color).toBe('string')
    expect(['headwind', 'tailwind', 'crosswind']).toContain(seg.classification)
    expect(seg.endKm).toBeGreaterThan(seg.startKm)
  })

  it('different forecasts → segments closer to forecast 1 use forecast 1 wind', () => {
    // Route: 3 points spaced ~1° apart — so it's about 110+ km
    // At 100 km/h, point1 midpoint arrives ~0.5 h in = ~T+00:30
    //              point2 midpoint arrives ~1.5 h in = ~T+01:30
    // Forecast at T+00:00 (wind from north = 0) → headwind for northward rider
    // Forecast at T+02:00 (wind from south = 180) → tailwind for northward rider
    // First segment midpoint is closest to T+00:00; second is closest to T+02:00
    const route = makeRoute([
      [127.0, 37.0],
      [127.0, 38.0], // ~111 km north
      [127.0, 39.0], // another ~111 km north
    ])
    const departure = '2026-04-02T07:00'
    const forecasts = [
      makeForecast('2026-04-02T07:00', 0, 10),  // wind FROM north → headwind when riding north
      makeForecast('2026-04-02T09:00', 180, 10), // wind FROM south → tailwind when riding north
    ]
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 100)
    expect(segments.length).toBeGreaterThanOrEqual(2)

    // First segment midpoint ≈ 55 km → arrival ~0:33 → nearest to T+07:00
    expect(segments[0].classification).toBe('headwind')
    // Last segment midpoint ≈ 167 km → arrival ~1:40 → nearest to T+09:00
    expect(segments[segments.length - 1].classification).toBe('tailwind')
  })

  it('long route: later segments reflect later forecast (wind changes over time)', () => {
    // 4-point route, first two legs at one wind, last two at another wind
    // We use fast speed so earlier segments land near forecast A and later near forecast B
    const route = makeRoute([
      [127.0, 37.0],
      [127.0, 37.5],  // ~55 km north
      [127.0, 38.0],  // another ~55 km
      [127.0, 38.5],  // another ~55 km
    ])
    const departure = '2026-04-02T06:00'
    const forecasts = [
      makeForecast('2026-04-02T06:00', 0, 10),   // headwind northward
      makeForecast('2026-04-02T10:00', 180, 10),  // tailwind northward (4h later)
    ]
    // At 20 km/h: first midpoint (~27km) arrives at ~1.35h → closest to T+06 (1.35h diff vs 2.65h)
    //             last midpoint  (~137km) arrives at ~6.85h → closest to T+10 (3.15h diff vs 0.85h)
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 20)
    expect(segments.length).toBeGreaterThanOrEqual(3)
    expect(segments[0].classification).toBe('headwind')
    expect(segments[segments.length - 1].classification).toBe('tailwind')
  })

  // -------------------------------------------------------------------------
  // findNearestForecast — tested via buildTimeAwareWindSegments behaviour
  // -------------------------------------------------------------------------

  it('findNearestForecast: picks nearest when arrival is exactly at a forecast time', () => {
    // Due-north route (~0.11 km); at 60 km/h midpoint arrives in ~0.5s → negligible offset
    // Departure = 07:00, forecasts at 07:00 and 08:00
    // Midpoint arrival ≈ 07:00:00 → nearest is 07:00
    const route = makeRoute([[127.0, 37.0], [127.0, 37.001]])  // same lng → due north
    const departure = '2026-04-02T07:00'
    const forecasts = [
      makeForecast('2026-04-02T07:00', 0, 10),  // wind FROM north → headwind when riding north
      makeForecast('2026-04-02T08:00', 180, 10), // wind FROM south → tailwind
    ]
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 60)
    // Arrival is extremely close to 07:00, so 07:00 forecast wins → headwind
    expect(segments[0].classification).toBe('headwind')
  })

  it('findNearestForecast: picks closer forecast when arrival is nearer to one of two options', () => {
    // Due-north tiny route; departure at 07:45 means midpoint arrival ≈ 07:45
    // Forecast at 07:00 is 45 min away; forecast at 09:00 is 75 min away → 07:00 wins → headwind
    const route = makeRoute([[127.0, 37.0], [127.0, 37.001]])  // same lng → due north
    const departure = '2026-04-02T07:45'
    const forecasts = [
      makeForecast('2026-04-02T07:00', 0, 10),  // 45 min before arrival → headwind northward
      makeForecast('2026-04-02T09:00', 180, 10), // 75 min after arrival → tailwind
    ]
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 20)
    expect(segments.length).toBeGreaterThan(0)
    // 07:00 is nearer → windDirection=0 → headwind
    expect(segments[0].classification).toBe('headwind')
  })

  it('findNearestForecast: arrival after all forecasts → uses last forecast', () => {
    // Due-north route; departure at 23:00 which is well past all forecast times
    // Nearest forecast is the later one (07:00 is 16h away vs 06:00 which is 17h away)
    const route = makeRoute([[127.0, 37.0], [127.0, 37.001]])  // same lng → due north
    const departure = '2026-04-02T23:00'
    const forecasts = [
      makeForecast('2026-04-02T06:00', 0, 10),  // 17h before arrival
      makeForecast('2026-04-02T07:00', 180, 10), // 16h before arrival (closer) → tailwind
    ]
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 20)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].classification).toBe('tailwind')
  })

  it('findNearestForecast: arrival before all forecasts → uses first forecast', () => {
    // Due-north route; departure at 01:00 is well before all forecast times
    // Nearest forecast is the earlier one (10:00 is 9h away vs 12:00 which is 11h away)
    const route = makeRoute([[127.0, 37.0], [127.0, 37.001]])  // same lng → due north
    const departure = '2026-04-02T01:00'
    const forecasts = [
      makeForecast('2026-04-02T10:00', 0, 10),  // 9h after arrival → headwind northward
      makeForecast('2026-04-02T12:00', 180, 10), // 11h after arrival (farther)
    ]
    const segments = buildTimeAwareWindSegments(route, forecasts, departure, 20)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments[0].classification).toBe('headwind')
  })
})

// ---------------------------------------------------------------------------
// Helpers for map overlay / weather point tests
// ---------------------------------------------------------------------------

/**
 * Build a straight north-going route of approximately `totalKm` km.
 * Each degree of latitude ≈ 111 km, so we step by totalKm/111 degrees.
 * We create `numPoints` evenly-spaced points.
 */
function makeNorthRoute(totalKm: number, numPoints: number = 20): RouteGeoJSON {
  const degStep = (totalKm / 111) / (numPoints - 1)
  const coords: [number, number][] = []
  for (let i = 0; i < numPoints; i++) {
    coords.push([127.0, 37.0 + degStep * i])
  }
  return makeRoute(coords)
}

function makeFullForecastSuite(baseIso: string): HourlyForecast[] {
  // 24 hourly forecasts starting from baseIso
  const base = new Date(baseIso).getTime()
  return Array.from({ length: 24 }, (_, i) => {
    const dt = new Date(base + i * 3600_000).toISOString().slice(0, 16)
    return {
      datetime: dt,
      temperature: 15 + i,
      windSpeed: 5,
      windDirection: 270, // westerly → crosswind for north-going rider
      precipitationProbability: 0,
      skyCondition: 1 as const,
      precipitationType: 0 as const,
    }
  })
}

// ---------------------------------------------------------------------------
// buildWindMapOverlays
// ---------------------------------------------------------------------------

describe('buildWindMapOverlays', () => {
  const departure = '2026-04-02T07:00'
  const avgSpeed = 20 // km/h

  it('null route → empty array', () => {
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWindMapOverlays(null, forecasts, departure, avgSpeed)).toEqual([])
  })

  it('undefined route → empty array', () => {
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWindMapOverlays(undefined, forecasts, departure, avgSpeed)).toEqual([])
  })

  it('empty route (no features) → empty array', () => {
    const route: RouteGeoJSON = { type: 'FeatureCollection', features: [] }
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWindMapOverlays(route, forecasts, departure, avgSpeed)).toEqual([])
  })

  it('empty forecasts → empty array', () => {
    const route = makeNorthRoute(50)
    expect(buildWindMapOverlays(route, [], departure, avgSpeed)).toEqual([])
  })

  it('avgSpeedKmh <= 0 → empty array', () => {
    const route = makeNorthRoute(50)
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWindMapOverlays(route, forecasts, departure, 0)).toEqual([])
    expect(buildWindMapOverlays(route, forecasts, departure, -5)).toEqual([])
  })

  it('100km route at 10km interval → ~10 overlays (between 9 and 12)', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    // Loop: km=0,10,20,...,100 → 11 steps, but floating-point route length may vary slightly
    expect(overlays.length).toBeGreaterThanOrEqual(9)
    expect(overlays.length).toBeLessThanOrEqual(12)
  })

  it('short route (5km) → 1-2 overlays', () => {
    const route = makeNorthRoute(5, 10)
    const forecasts = makeFullForecastSuite(departure)
    // Default interval = 10km; a 5km route: km=0 (inside), km=10 (outside) → 1 overlay
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    expect(overlays.length).toBeGreaterThanOrEqual(1)
    expect(overlays.length).toBeLessThanOrEqual(2)
  })

  it('each overlay has required fields: lat, lng, windDirection, windSpeed, classification', () => {
    const route = makeNorthRoute(30)
    const forecasts = makeFullForecastSuite(departure)
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    expect(overlays.length).toBeGreaterThan(0)
    for (const overlay of overlays) {
      expect(typeof overlay.lat).toBe('number')
      expect(typeof overlay.lng).toBe('number')
      expect(typeof overlay.windDirection).toBe('number')
      expect(typeof overlay.windSpeed).toBe('number')
      expect(['headwind', 'tailwind', 'crosswind']).toContain(overlay.classification)
    }
  })

  it('overlay coordinates are within the route bounding box', () => {
    // North-going route: lat from 37.0 to ~37 + totalKm/111, lng fixed at 127.0
    const totalKm = 50
    const route = makeNorthRoute(totalKm, 20)
    const forecasts = makeFullForecastSuite(departure)
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    const latMax = 37.0 + (totalKm / 111) + 0.01 // small tolerance
    for (const overlay of overlays) {
      expect(overlay.lat).toBeGreaterThanOrEqual(37.0 - 0.01)
      expect(overlay.lat).toBeLessThanOrEqual(latMax)
      expect(overlay.lng).toBeGreaterThanOrEqual(126.99)
      expect(overlay.lng).toBeLessThanOrEqual(127.01)
    }
  })

  it('first overlay is at (or near) the route start', () => {
    const route = makeNorthRoute(50)
    const forecasts = makeFullForecastSuite(departure)
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    expect(overlays.length).toBeGreaterThan(0)
    const first = overlays[0]
    expect(first.lat).toBeCloseTo(37.0, 2)
    expect(first.lng).toBeCloseTo(127.0, 2)
  })

  it('windSpeed and windDirection values come from the forecast', () => {
    // Use a single forecast with known values
    const route = makeNorthRoute(20, 5)
    const forecasts: HourlyForecast[] = [
      {
        datetime: departure,
        temperature: 12,
        windSpeed: 7,
        windDirection: 90,
        precipitationProbability: 0,
        skyCondition: 1,
        precipitationType: 0,
      },
    ]
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 10)
    expect(overlays.length).toBeGreaterThan(0)
    for (const overlay of overlays) {
      expect(overlay.windSpeed).toBe(7)
      expect(overlay.windDirection).toBe(90)
    }
  })

  it('custom interval respected: 5km interval on 20km route → ~5 overlays', () => {
    const route = makeNorthRoute(20)
    const forecasts = makeFullForecastSuite(departure)
    // km=0,5,10,15,20 → 5 points
    const overlays = buildWindMapOverlays(route, forecasts, departure, avgSpeed, 5)
    expect(overlays.length).toBeGreaterThanOrEqual(4)
    expect(overlays.length).toBeLessThanOrEqual(6)
  })
})

// ---------------------------------------------------------------------------
// buildWeatherMapPoints
// ---------------------------------------------------------------------------

describe('buildWeatherMapPoints', () => {
  const departure = '2026-04-02T07:00'
  const avgSpeed = 20 // km/h

  it('null route → empty array', () => {
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWeatherMapPoints(null, forecasts, departure, avgSpeed)).toEqual([])
  })

  it('undefined route → empty array', () => {
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWeatherMapPoints(undefined, forecasts, departure, avgSpeed)).toEqual([])
  })

  it('empty forecasts → empty array', () => {
    const route = makeNorthRoute(100)
    expect(buildWeatherMapPoints(route, [], departure, avgSpeed)).toEqual([])
  })

  it('avgSpeedKmh <= 0 → empty array', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    expect(buildWeatherMapPoints(route, forecasts, departure, 0)).toEqual([])
    expect(buildWeatherMapPoints(route, forecasts, departure, -1)).toEqual([])
  })

  it('normal route → returns exactly 4 points', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    expect(points).toHaveLength(4)
  })

  it('labels are 출발, 경유, 경유, 도착 in order', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    expect(points[0].label).toBe('출발')
    expect(points[1].label).toBe('경유')
    expect(points[2].label).toBe('경유')
    expect(points[3].label).toBe('도착')
  })

  it('first point is approximately at the route start (ratio 0)', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    expect(points[0].lat).toBeCloseTo(37.0, 2)
    expect(points[0].lng).toBeCloseTo(127.0, 2)
  })

  it('last point is approximately at the route end (ratio 1)', () => {
    const totalKm = 100
    const route = makeNorthRoute(totalKm)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    const expectedEndLat = 37.0 + totalKm / 111
    expect(points[3].lat).toBeCloseTo(expectedEndLat, 1)
    expect(points[3].lng).toBeCloseTo(127.0, 2)
  })

  it('each point has temperature, skyCondition, precipitationType, estimatedTime', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    for (const pt of points) {
      expect(typeof pt.temperature).toBe('number')
      expect([1, 3, 4]).toContain(pt.skyCondition)
      expect([0, 1, 2, 3, 5, 6, 7]).toContain(pt.precipitationType)
      expect(typeof pt.estimatedTime).toBe('string')
      // estimatedTime format HH:MM
      expect(pt.estimatedTime).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('each point has lat and lng as numbers', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    for (const pt of points) {
      expect(typeof pt.lat).toBe('number')
      expect(typeof pt.lng).toBe('number')
    }
  })

  it('first point estimatedTime equals departure time (ratio=0, km=0)', () => {
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    // At km=0, arrivalMs = departureMs, so estimatedTime = departure hour:min
    const dep = new Date(departure)
    const hh = String(dep.getHours()).padStart(2, '0')
    const mm = String(dep.getMinutes()).padStart(2, '0')
    expect(points[0].estimatedTime).toBe(`${hh}:${mm}`)
  })

  it('later points have estimatedTime >= earlier points (time is non-decreasing)', () => {
    const route = makeNorthRoute(80)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    // Convert HH:MM to minutes for comparison
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    for (let i = 1; i < points.length; i++) {
      expect(toMinutes(points[i].estimatedTime)).toBeGreaterThanOrEqual(
        toMinutes(points[i - 1].estimatedTime),
      )
    }
  })

  it('short route (2km) → still returns 4 points', () => {
    // buildWeatherMapPoints uses route proportions (0, 1/3, 2/3, 1) so even
    // a very short route should yield 4 points as long as it has >= 2 coordinates
    const route = makeNorthRoute(2, 5)
    const forecasts = makeFullForecastSuite(departure)
    const points = buildWeatherMapPoints(route, forecasts, departure, avgSpeed)
    expect(points).toHaveLength(4)
  })

  it('weather values (temperature) differ across points when forecasts change over time', () => {
    // Each forecast has temperature = 15 + i, so later arrivals get higher temperature
    // Use a slow speed so the 4 points span multiple forecast hours
    const route = makeNorthRoute(100)
    const forecasts = makeFullForecastSuite(departure) // temperature: 15..38
    const slowSpeed = 5 // km/h → 100km takes 20h, covering many forecasts
    const points = buildWeatherMapPoints(route, forecasts, departure, slowSpeed)
    expect(points).toHaveLength(4)
    // First point (km=0) → temperature=15; last point (km=100) → arrival +20h → temperature=35
    expect(points[0].temperature).toBeLessThan(points[3].temperature)
  })
})
