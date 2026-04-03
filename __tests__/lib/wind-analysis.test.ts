import { describe, it, expect } from 'vitest'
import {
  calculateBearing,
  classifyWind,
  buildWindSegments,
  summarizeWind,
} from '@/lib/wind-analysis'
import type { WindSegment } from '@/lib/wind-analysis'
import type { RouteGeoJSON } from '@/types/course'

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
