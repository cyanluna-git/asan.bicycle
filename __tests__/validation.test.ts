import { describe, it, expect } from 'vitest'
import { haversineKm, isWithinAsan, ASAN_CENTER, ASAN_RADIUS_KM } from '@/lib/validation'

describe('haversineKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineKm(36.7897, 127.002, 36.7897, 127.002)).toBe(0)
  })

  it('returns ~86.4 km between Asan and Seoul city centers', () => {
    const dist = haversineKm(36.7897, 127.002, 37.5665, 126.978)
    expect(dist).toBeCloseTo(86.4, 0)
  })

  it('is symmetric — distance A→B equals B→A', () => {
    const ab = haversineKm(36.7897, 127.002, 37.5665, 126.978)
    const ba = haversineKm(37.5665, 126.978, 36.7897, 127.002)
    expect(ab).toBeCloseTo(ba, 8)
  })

  it('returns a small positive value for nearby points', () => {
    const dist = haversineKm(36.79, 127.00, 36.7897, 127.002)
    expect(dist).toBeGreaterThan(0)
    expect(dist).toBeCloseTo(0.181, 2)
  })

  it('ASAN_CENTER and ASAN_RADIUS_KM constants have expected values', () => {
    expect(ASAN_CENTER.lat).toBe(36.7897)
    expect(ASAN_CENTER.lng).toBe(127.002)
    expect(ASAN_RADIUS_KM).toBe(20)
  })
})

describe('isWithinAsan', () => {
  it('returns true for Asan city center itself', () => {
    expect(isWithinAsan(ASAN_CENTER.lat, ASAN_CENTER.lng)).toBe(true)
  })

  it('returns true for a coordinate close to Asan center (36.79, 127.00)', () => {
    // ~0.18 km away — well within 20 km radius
    expect(isWithinAsan(36.79, 127.0)).toBe(true)
  })

  it('returns false for Seoul city center (~86 km away)', () => {
    expect(isWithinAsan(37.5665, 126.978)).toBe(false)
  })

  it('returns false for Daejeon (~48 km away from Asan center)', () => {
    expect(isWithinAsan(36.3504, 127.3845)).toBe(false)
  })

  it('returns true for a coordinate ~19.9 km north of Asan center (inside boundary)', () => {
    // 19.9 km north: lat offset ≈ 19.9/111.32
    const insideLat = ASAN_CENTER.lat + 19.9 / 111.32
    expect(isWithinAsan(insideLat, ASAN_CENTER.lng)).toBe(true)
  })

  it('returns false for a coordinate ~20.1 km north of Asan center (outside boundary)', () => {
    // 20.1 km north: lat offset ≈ 20.1/111.32
    const outsideLat = ASAN_CENTER.lat + 20.1 / 111.32
    expect(isWithinAsan(outsideLat, ASAN_CENTER.lng)).toBe(false)
  })

  it('returns true for a coordinate exactly on the boundary (≤ 20 km)', () => {
    // ~19.98 km away — haversine is slightly less than the naive lat offset due to curvature
    const boundaryLat = ASAN_CENTER.lat + 20 / 111.32
    const dist = haversineKm(boundaryLat, ASAN_CENTER.lng, ASAN_CENTER.lat, ASAN_CENTER.lng)
    // dist ≈ 19.98 — should be within 20 km
    expect(dist).toBeLessThanOrEqual(20)
    expect(isWithinAsan(boundaryLat, ASAN_CENTER.lng)).toBe(true)
  })
})
