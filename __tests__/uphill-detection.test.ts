import { describe, it, expect } from 'vitest'
import { detectUphillSegments } from '@/lib/uphill-detection'
import type { ElevationPoint } from '@/types/course'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a simple elevation profile from [km, ele] pairs. */
function buildProfile(pairs: [number, number][]): ElevationPoint[] {
  return pairs.map(([distanceKm, elevationM]) => ({ distanceKm, elevationM }))
}

// ---------------------------------------------------------------------------
// Basic detection (GRADIENT_THRESHOLD = 7%)
// ---------------------------------------------------------------------------

describe('detectUphillSegments — basic', () => {
  it('returns empty array for empty or single-point profile', () => {
    expect(detectUphillSegments([])).toEqual([])
    expect(detectUphillSegments([{ distanceKm: 0, elevationM: 100 }])).toEqual([])
  })

  it('returns empty array for flat profile', () => {
    const profile = buildProfile([
      [0, 100],
      [1, 100],
      [2, 100],
      [3, 100],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })

  it('returns empty array for descending profile', () => {
    const profile = buildProfile([
      [0, 200],
      [1, 150],
      [2, 100],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })

  it('detects a single uphill segment with gradient >= 3%', () => {
    // 4% gradient = 40m rise over 1km
    const profile = buildProfile([
      [0, 100],
      [0.5, 120], // 40m / 1000m = 4% (over 0.5km = 20m)
      [1.0, 140],
      [1.5, 160],
      [3.0, 160], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].start_km).toBe(0)
    expect(result[0].end_km).toBe(1.5)
    expect(result[0].name).toBe('업힐 1')
  })

  it('ignores segments below 3% gradient', () => {
    // 2% gradient — below threshold
    const profile = buildProfile([
      [0, 100],
      [1.0, 120], // 20m / 1000m = 2%
      [2.0, 140],
      [3.0, 160],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Minimum length filter (MIN_SEGMENT_LENGTH_KM = 1.0 km)
// ---------------------------------------------------------------------------

describe('detectUphillSegments — min length', () => {
  it('filters out segments shorter than 1 km', () => {
    // 8% gradient but only 0.5 km
    const profile = buildProfile([
      [0, 100],
      [0.25, 120], // 8%
      [0.5, 140],  // 8%
      [2.0, 140],  // flat
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })

  it('keeps segments >= 1 km', () => {
    const profile = buildProfile([
      [0, 100],
      [0.5, 140],  // 8%
      [1.0, 180],  // 8%
      [1.5, 220],  // 8%
      [3.0, 220],  // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].end_km - result[0].start_km).toBeGreaterThanOrEqual(1.0)
  })
})

// ---------------------------------------------------------------------------
// Merging (MERGE_GAP_KM = 0.5 km)
// ---------------------------------------------------------------------------

describe('detectUphillSegments — merge', () => {
  it('merges segments separated by < 0.5 km gap', () => {
    const profile = buildProfile([
      [0, 100],
      [0.5, 140],  // 8% — first climb
      [1.0, 180],  // 8%
      [1.3, 180],  // flat gap 0.3 km → should merge
      [1.5, 196],  // 8% — second climb
      [2.0, 236],  // 8%
      [3.0, 236],  // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1) // merged into one
    expect(result[0].start_km).toBe(0)
    expect(result[0].end_km).toBe(2.0)
  })

  it('does NOT merge segments separated by >= 0.5 km gap', () => {
    const profile = buildProfile([
      [0, 100],
      [0.5, 140],  // 8% — first climb
      [1.2, 196],  // end first climb (1.2 km)
      [1.8, 196],  // 0.6 km flat gap → do NOT merge
      [2.4, 196],
      [2.8, 228],  // 8% — second climb
      [3.5, 284],  // 8%
      [4.5, 284],  // flat — second climb 1.1 km
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

describe('detectUphillSegments — naming', () => {
  it('assigns incremental names', () => {
    const profile = buildProfile([
      [0, 100],
      [0.5, 140],  // 8%
      [1.2, 196],  // 8% — end first uphill (1.2 km)
      [2.0, 196],  // flat gap 0.8 km → does NOT merge
      [2.8, 196],
      [3.2, 228],  // 8%
      [3.8, 276],  // 8%
      [4.5, 332],  // 8% — second uphill ~1.7 km
      [5.5, 332],  // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(2)
    expect(result[0].name).toBe('업힐 1')
    expect(result[1].name).toBe('업힐 2')
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('detectUphillSegments — edge cases', () => {
  it('treats gradient exactly at 3% threshold as uphill (boundary inclusive)', () => {
    // exactly 3%: 30m rise over 1000m
    const profile = buildProfile([
      [0, 100],
      [1.0, 130], // 30m / 1000m = 3%
      [2.0, 160], // 3%
      [2.5, 175], // 3%
      [4.0, 175], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].start_km).toBe(0)
  })

  it('skips zero-distance intervals (duplicate km points)', () => {
    const profile = buildProfile([
      [0, 100],
      [0, 150],   // same distance, should be skipped
      [0.5, 180], // 16% from 0
      [1.0, 220],
      [1.5, 260],
      [2.5, 260], // flat
    ])
    expect(() => detectUphillSegments(profile)).not.toThrow()
  })

  it('detects segment ending at last point (flush case)', () => {
    const profile = buildProfile([
      [0, 100],
      [0.5, 140],  // 8%
      [1.0, 180],  // 8%
      [1.5, 220],  // 8% — last point
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].end_km).toBe(1.5)
  })

  it('merged segment still too short after merge is filtered out', () => {
    // Two short steep segments each ~0.3 km with 0.2 km gap → merged ~0.8 km < 1 km
    const profile = buildProfile([
      [0, 100],
      [0.15, 112], // 8%
      [0.3, 124],  // end first
      [0.5, 124],  // 0.2 km flat gap → merges
      [0.65, 136], // 8%
      [0.8, 148],  // end second
      [2.0, 148],  // flat
    ])
    const result = detectUphillSegments(profile)
    // merged span: 0 ~ 0.8 = 0.8 km < 1.0 km → filtered
    expect(result.length).toBe(0)
  })

  it('start_km and end_km are rounded to 2 decimal places', () => {
    const profile = buildProfile([
      [0, 100],
      [0.333, 127],
      [0.666, 154],
      [1.0, 181],
      [1.333, 208],
      [2.5, 208], // flat
    ])
    const result = detectUphillSegments(profile)
    if (result.length > 0) {
      expect(result[0].start_km).toBe(Math.round(result[0].start_km * 100) / 100)
      expect(result[0].end_km).toBe(Math.round(result[0].end_km * 100) / 100)
    }
  })

  it('gradient just below 3% is not detected as uphill', () => {
    // 2.9% gradient
    const profile = buildProfile([
      [0, 100],
      [1.0, 129], // 29m / 1000m = 2.9% < 3%
      [2.0, 158],
      [3.0, 187],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })
})
