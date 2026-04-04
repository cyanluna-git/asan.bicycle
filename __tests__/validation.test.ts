import { describe, it, expect } from 'vitest'
import { haversineKm, isValidCourseLocation, ASAN_CENTER, ASAN_RADIUS_KM } from '@/lib/validation'

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

describe('isValidCourseLocation', () => {
  it('returns true for Asan city center (Korea territory)', () => {
    expect(isValidCourseLocation(ASAN_CENTER.lat, ASAN_CENTER.lng)).toBe(true)
  })

  it('returns true for Seoul city center', () => {
    expect(isValidCourseLocation(37.5665, 126.978)).toBe(true)
  })

  it('returns true for Busan', () => {
    expect(isValidCourseLocation(35.1796, 129.0756)).toBe(true)
  })

  it('returns true for Jeju island', () => {
    expect(isValidCourseLocation(33.4996, 126.5312)).toBe(true)
  })

  it('returns false for Tokyo (outside Korea territory)', () => {
    expect(isValidCourseLocation(35.6762, 139.6503)).toBe(false)
  })

  it('returns false for coordinates north of Korea (lat > 38.5)', () => {
    expect(isValidCourseLocation(39.0, 127.0)).toBe(false)
  })

  it('returns false for coordinates with longitude outside Korea range', () => {
    expect(isValidCourseLocation(37.0, 124.0)).toBe(false)
  })

  it('returns true for boundary coordinates (lat 33, lng 125)', () => {
    expect(isValidCourseLocation(33, 125)).toBe(true)
  })

  it('returns true for boundary coordinates (lat 38.5, lng 130)', () => {
    expect(isValidCourseLocation(38.5, 130)).toBe(true)
  })
})
