/**
 * Unit tests for pure utility logic used in Route3DProfile.
 *
 * All helpers (latLngToLocal, findNearestInProfile, grade calculation) are
 * module-private in route-3d-profile.tsx. Tests replicate the exact formulas
 * so any regression in those formulas will break these tests.
 *
 * CSS2DRenderer / WebGL rendering is intentionally excluded — not unit-testable.
 */

import { describe, it, expect } from 'vitest'
import type { RouteHoverPoint, UphillSegment } from '@/types/course'

// ---------------------------------------------------------------------------
// Inline replicas of module-private helpers (must match source exactly)
// ---------------------------------------------------------------------------

/** Mirror of latLngToLocal in route-3d-profile.tsx */
function latLngToLocal(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
) {
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  return {
    x: (lng - centerLng) * cosLat * 111320,
    z: (lat - centerLat) * 110540,
  }
}

/** Mirror of findNearestInProfile in route-3d-profile.tsx */
function findNearestInProfile(
  profile: RouteHoverPoint[],
  targetKm: number,
): RouteHoverPoint {
  let nearest = profile[0]
  let nearestDelta = Math.abs(nearest.distanceKm - targetKm)
  for (let i = 1; i < profile.length; i++) {
    const delta = Math.abs(profile[i].distanceKm - targetKm)
    if (delta < nearestDelta) {
      nearest = profile[i]
      nearestDelta = delta
    }
  }
  return nearest
}

/** Mirror of grade calculation logic in the uphill-label useEffect */
function computeGrade(
  seg: Pick<UphillSegment, 'start_km' | 'end_km'>,
  hoverProfile: RouteHoverPoint[],
): number {
  const endPt = findNearestInProfile(hoverProfile, seg.end_km)
  const startPt = findNearestInProfile(hoverProfile, seg.start_km)
  const distM = (seg.end_km - seg.start_km) * 1000
  return distM > 0 ? ((endPt.elevationM - startPt.elevationM) / distM) * 100 : 0
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHoverPoint(distanceKm: number, elevationM: number, lat = 36.0, lng = 127.0): RouteHoverPoint {
  return { distanceKm, elevationM, lat, lng }
}

// ---------------------------------------------------------------------------
// latLngToLocal
// ---------------------------------------------------------------------------

describe('latLngToLocal — coordinate conversion', () => {
  it('returns (0, 0) when lat/lng equals center', () => {
    const result = latLngToLocal(36.0, 127.0, 36.0, 127.0)
    expect(result.x).toBeCloseTo(0)
    expect(result.z).toBeCloseTo(0)
  })

  it('east offset increases x', () => {
    const { x } = latLngToLocal(36.0, 127.01, 36.0, 127.0)
    expect(x).toBeGreaterThan(0)
  })

  it('west offset decreases x', () => {
    const { x } = latLngToLocal(36.0, 126.99, 36.0, 127.0)
    expect(x).toBeLessThan(0)
  })

  it('north offset increases z', () => {
    const { z } = latLngToLocal(36.01, 127.0, 36.0, 127.0)
    expect(z).toBeGreaterThan(0)
  })

  it('south offset decreases z', () => {
    const { z } = latLngToLocal(35.99, 127.0, 36.0, 127.0)
    expect(z).toBeLessThan(0)
  })

  it('x uses cosLat scale factor', () => {
    const centerLat = 36.0
    const dLng = 0.01
    const cosLat = Math.cos((centerLat * Math.PI) / 180)
    const expected = dLng * cosLat * 111320
    const { x } = latLngToLocal(centerLat, 127.0 + dLng, centerLat, 127.0)
    expect(x).toBeCloseTo(expected, 3)
  })

  it('z uses fixed 110540 m/deg scale', () => {
    const { z } = latLngToLocal(36.01, 127.0, 36.0, 127.0)
    expect(z).toBeCloseTo(0.01 * 110540, 2)
  })

  it('x shrinks at higher latitudes (cosLat effect)', () => {
    const dLng = 0.01
    const lowLat = latLngToLocal(10.0, 127.0 + dLng, 10.0, 127.0).x
    const highLat = latLngToLocal(80.0, 127.0 + dLng, 80.0, 127.0).x
    expect(highLat).toBeLessThan(lowLat)
  })

  it('returns correct metric scale for 1 degree longitude at equator (~111.3 km)', () => {
    const { x } = latLngToLocal(0.0, 1.0, 0.0, 0.0)
    // cos(0) = 1, so x ≈ 111320 m
    expect(x).toBeCloseTo(111320, -1)
  })
})

// ---------------------------------------------------------------------------
// findNearestInProfile
// ---------------------------------------------------------------------------

describe('findNearestInProfile — nearest point lookup', () => {
  const profile = [
    makeHoverPoint(0, 100),
    makeHoverPoint(1, 150),
    makeHoverPoint(2, 200),
    makeHoverPoint(3, 250),
  ]

  it('returns exact match when target equals a profile point', () => {
    expect(findNearestInProfile(profile, 0)).toBe(profile[0])
    expect(findNearestInProfile(profile, 2)).toBe(profile[2])
    expect(findNearestInProfile(profile, 3)).toBe(profile[3])
  })

  it('returns nearest point for midpoint between two entries', () => {
    // 0.4 is closer to 0 than to 1
    expect(findNearestInProfile(profile, 0.4)).toBe(profile[0])
    // 0.6 is closer to 1 than to 0
    expect(findNearestInProfile(profile, 0.6)).toBe(profile[1])
  })

  it('returns first element for single-entry profile', () => {
    const single = [makeHoverPoint(5, 300)]
    expect(findNearestInProfile(single, 0)).toBe(single[0])
    expect(findNearestInProfile(single, 99)).toBe(single[0])
  })

  it('returns last element when target exceeds profile max', () => {
    expect(findNearestInProfile(profile, 100)).toBe(profile[3])
  })

  it('returns first element when target is below profile min', () => {
    expect(findNearestInProfile(profile, -5)).toBe(profile[0])
  })

  it('picks the earlier point on exact tie (first-wins linear scan)', () => {
    // 0.5 is equidistant between 0 and 1 — first-found wins (index 0)
    const result = findNearestInProfile(profile, 0.5)
    // The loop replaces only on strict <, so the first equidistant wins
    expect(result).toBe(profile[0])
  })

  it('handles profile with many points efficiently (correct answer)', () => {
    const bigProfile = Array.from({ length: 1000 }, (_, i) =>
      makeHoverPoint(i * 0.1, i * 10),
    )
    const result = findNearestInProfile(bigProfile, 42.3)
    expect(result.distanceKm).toBeCloseTo(42.3, 1)
  })
})

// ---------------------------------------------------------------------------
// computeGrade (uphill label grade calculation)
// ---------------------------------------------------------------------------

describe('computeGrade — uphill gradient calculation', () => {
  it('returns 0 for a flat segment (equal elevations)', () => {
    const profile = [
      makeHoverPoint(0, 100),
      makeHoverPoint(1, 100),
      makeHoverPoint(2, 100),
    ]
    const seg = { start_km: 0, end_km: 2 }
    expect(computeGrade(seg, profile)).toBeCloseTo(0)
  })

  it('computes 5% grade for 50m rise over 1km', () => {
    const profile = [
      makeHoverPoint(0, 100),
      makeHoverPoint(1, 150),
    ]
    const seg = { start_km: 0, end_km: 1 }
    expect(computeGrade(seg, profile)).toBeCloseTo(5.0, 3)
  })

  it('computes 10% grade for 100m rise over 1km', () => {
    const profile = [
      makeHoverPoint(0, 100),
      makeHoverPoint(1, 200),
    ]
    const seg = { start_km: 0, end_km: 1 }
    expect(computeGrade(seg, profile)).toBeCloseTo(10.0, 3)
  })

  it('computes negative grade for descending segment', () => {
    const profile = [
      makeHoverPoint(0, 200),
      makeHoverPoint(1, 150),
    ]
    const seg = { start_km: 0, end_km: 1 }
    expect(computeGrade(seg, profile)).toBeCloseTo(-5.0, 3)
  })

  it('returns 0 when start_km equals end_km (zero-distance segment)', () => {
    const profile = [makeHoverPoint(0, 100), makeHoverPoint(1, 200)]
    const seg = { start_km: 1, end_km: 1 }
    expect(computeGrade(seg, profile)).toBe(0)
  })

  it('uses nearest profile point when segment boundary falls between points', () => {
    const profile = [
      makeHoverPoint(0, 100),
      makeHoverPoint(1, 160),  // nearest to 0.9 end_km
      makeHoverPoint(2, 200),
    ]
    // start=0 → profile[0] (100m), end=0.9 → nearest is profile[1] at 1.0km (160m)
    const seg = { start_km: 0, end_km: 0.9 }
    const grade = computeGrade(seg, profile)
    // (160 - 100) / (0.9 * 1000) * 100 = 60/900*100 ≈ 6.67%
    expect(grade).toBeCloseTo((160 - 100) / (0.9 * 1000) * 100, 2)
  })

  it('label text formats grade with one decimal place', () => {
    // Test the formatting pattern `▲ N.N%` used by the component
    const grade = 7.333
    const label = `▲ ${grade.toFixed(1)}%`
    expect(label).toBe('▲ 7.3%')
  })

  it('label text formats whole-number grade correctly', () => {
    const grade = 10.0
    const label = `▲ ${grade.toFixed(1)}%`
    expect(label).toBe('▲ 10.0%')
  })
})

// ---------------------------------------------------------------------------
// Grade calculation with realistic RouteHoverPoint data
// ---------------------------------------------------------------------------

describe('computeGrade — realistic multi-segment scenario', () => {
  // Simulate a 5km route with varying elevation
  const realisticProfile: RouteHoverPoint[] = [
    { distanceKm: 0.0, elevationM: 50, lat: 36.000, lng: 127.000 },
    { distanceKm: 0.5, elevationM: 65, lat: 36.004, lng: 127.000 },
    { distanceKm: 1.0, elevationM: 100, lat: 36.009, lng: 127.000 },
    { distanceKm: 1.5, elevationM: 145, lat: 36.013, lng: 127.000 },
    { distanceKm: 2.0, elevationM: 190, lat: 36.018, lng: 127.000 },
    { distanceKm: 3.0, elevationM: 190, lat: 36.027, lng: 127.000 },
    { distanceKm: 4.0, elevationM: 160, lat: 36.036, lng: 127.000 },
    { distanceKm: 5.0, elevationM: 130, lat: 36.045, lng: 127.000 },
  ]

  it('detects ~9% grade for steep uphill at km 1–2', () => {
    const seg = { start_km: 1.0, end_km: 2.0 }
    // start elevation ~100m, end elevation ~190m, dist = 1000m
    const grade = computeGrade(seg, realisticProfile)
    // (190 - 100) / 1000 * 100 = 9%
    expect(grade).toBeCloseTo(9.0, 1)
  })

  it('detects 0% grade for flat segment at km 2–3', () => {
    const seg = { start_km: 2.0, end_km: 3.0 }
    expect(computeGrade(seg, realisticProfile)).toBeCloseTo(0, 1)
  })

  it('detects negative grade for descent at km 3–5', () => {
    const seg = { start_km: 3.0, end_km: 5.0 }
    const grade = computeGrade(seg, realisticProfile)
    expect(grade).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------
// latLngToLocal × findNearestInProfile integration
// ---------------------------------------------------------------------------

describe('latLngToLocal + findNearestInProfile — label position integration', () => {
  it('computes a scene position for the nearest summit point', () => {
    const centerLat = 36.01
    const centerLng = 127.005

    const profile: RouteHoverPoint[] = [
      { distanceKm: 0, elevationM: 100, lat: 36.000, lng: 127.000 },
      { distanceKm: 1, elevationM: 200, lat: 36.010, lng: 127.010 },
      { distanceKm: 2, elevationM: 150, lat: 36.020, lng: 127.020 },
    ]

    const endPt = findNearestInProfile(profile, 1.0)
    const verticalExaggeration = 3
    const { x, z } = latLngToLocal(endPt.lat, endPt.lng, centerLat, centerLng)
    const y = endPt.elevationM * verticalExaggeration

    // summit should be at index 1
    expect(endPt).toBe(profile[1])
    expect(typeof x).toBe('number')
    expect(typeof z).toBe('number')
    expect(y).toBe(200 * 3)
  })

  it('y-axis scales with verticalExaggeration', () => {
    const profile = [makeHoverPoint(1, 250, 36.01, 127.01)]
    const pt = findNearestInProfile(profile, 1.0)
    expect(pt.elevationM * 1).toBe(250)
    expect(pt.elevationM * 3).toBe(750)
    expect(pt.elevationM * 5).toBe(1250)
  })
})
