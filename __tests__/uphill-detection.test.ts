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
// Basic detection
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

  it('detects a single uphill segment with gradient >= 5%', () => {
    // 5% gradient = 50m rise over 1km
    const profile = buildProfile([
      [0, 100],
      [0.5, 130], // 30m / 500m = 6% gradient
      [1.0, 160], // 30m / 500m = 6%
      [2.0, 160], // flat
      [3.0, 160], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].start_km).toBe(0)
    expect(result[0].end_km).toBe(1.0)
    expect(result[0].name).toBe('업힐 1')
  })

  it('ignores segments below 5% gradient', () => {
    // 4% gradient = 40m rise over 1km
    const profile = buildProfile([
      [0, 100],
      [1.0, 139], // 39m / 1000m = 3.9%
      [2.0, 178], // 39m / 1000m = 3.9%
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Minimum length filter
// ---------------------------------------------------------------------------

describe('detectUphillSegments — min length', () => {
  it('filters out segments shorter than 0.2 km', () => {
    const profile = buildProfile([
      [0, 100],
      [0.1, 115], // steep but only 0.1 km
      [0.5, 115], // flat
      [1.0, 115],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })

  it('keeps segments >= 0.2 km', () => {
    const profile = buildProfile([
      [0, 100],
      [0.1, 110], // 10m / 100m = 10%
      [0.2, 120], // 10m / 100m = 10%
      [0.3, 130], // 10m / 100m = 10%
      [1.0, 130], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].end_km - result[0].start_km).toBeGreaterThanOrEqual(0.2)
  })
})

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

describe('detectUphillSegments — merge', () => {
  it('merges segments separated by < 0.1 km gap', () => {
    const profile = buildProfile([
      [0, 100],
      [0.2, 115], // steep
      [0.4, 130], // steep -> end of first uphill
      [0.45, 130], // tiny flat gap (0.05 km) -> should merge
      [0.5, 135], // steep again
      [0.7, 150], // steep
      [1.0, 150], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1) // merged into one
  })

  it('does NOT merge segments separated by >= 0.1 km gap', () => {
    const profile = buildProfile([
      [0, 100],
      [0.2, 115],
      [0.4, 130], // end first uphill
      [0.6, 130], // 0.2 km flat gap
      [0.8, 145],
      [1.0, 160], // second uphill
      [1.5, 160], // flat
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
      [0.3, 125],
      [0.6, 150],
      [1.0, 150], // flat gap
      [1.5, 150],
      [1.8, 175],
      [2.1, 200],
      [3.0, 200],
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
  it('treats gradient exactly at 5% threshold as uphill (boundary inclusive)', () => {
    // exactly 5% gradient: 50m rise over 1000m (1 km)
    const profile = buildProfile([
      [0, 100],
      [1.0, 150], // exactly 50m / 1000m = 5%
      [1.5, 175], // another 5%
      [2.0, 200], // another 5%
      [3.0, 200], // flat
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].start_km).toBe(0)
  })

  it('skips zero-distance intervals (duplicate km points)', () => {
    // dKm = 0 should be skipped without crashing
    const profile = buildProfile([
      [0, 100],
      [0, 150], // same distance, should be skipped
      [0.5, 180], // steep from 0
      [0.8, 207],
      [1.2, 207], // flat
    ])
    // Should not throw; result may or may not detect uphill but must not crash
    expect(() => detectUphillSegments(profile)).not.toThrow()
  })

  it('detects segment ending at last point (flush case)', () => {
    // Uphill goes all the way to the end of the profile
    const profile = buildProfile([
      [0, 100],
      [0.5, 130], // 6%
      [1.0, 160], // 6%
      [1.5, 190], // 6% — last point, no flat trailing
    ])
    const result = detectUphillSegments(profile)
    expect(result.length).toBe(1)
    expect(result[0].end_km).toBe(1.5)
  })

  it('merged segment that is still too short is filtered out', () => {
    // Two tiny steep segments each 0.05 km separated by < 0.1 km gap
    // Merged total: 0.05 + 0.05 + tiny gap = ~0.15 km still < 0.2 km → filtered
    const profile = buildProfile([
      [0, 100],
      [0.05, 106], // 12% gradient (6m/50m)
      [0.09, 106], // flat (gap of 0.04 km) → merge candidate
      [0.14, 112], // 12% gradient
      [1.0, 112],  // flat
    ])
    const result = detectUphillSegments(profile)
    // If merged total is < 0.2 km, it should be filtered
    expect(result.length).toBe(0)
  })

  it('start_km and end_km are rounded to 2 decimal places', () => {
    const profile = buildProfile([
      [0, 100],
      [0.333, 120], // rise to trigger uphill
      [0.666, 140],
      [1.0, 140], // flat
    ])
    const result = detectUphillSegments(profile)
    if (result.length > 0) {
      // Values should be rounded to 2 dp
      expect(result[0].start_km).toBe(Math.round(result[0].start_km * 100) / 100)
      expect(result[0].end_km).toBe(Math.round(result[0].end_km * 100) / 100)
    }
  })

  it('gradient just below 5% is not detected as uphill', () => {
    // 4.99% gradient: 49.9m rise over 1000m
    const profile = buildProfile([
      [0, 100],
      [1.0, 149.9], // 49.9m / 1000m = 4.99% < 5%
      [2.0, 199.8],
    ])
    expect(detectUphillSegments(profile)).toEqual([])
  })
})
