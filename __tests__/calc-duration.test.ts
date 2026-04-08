import { describe, expect, it } from 'vitest'
import {
  SPEED_ADVANCED,
  SPEED_BEGINNER,
  SPEED_INTERMEDIATE,
  calcDuration,
} from '@/lib/calc-duration'

// ---------------------------------------------------------------------------
// Speed presets — flat course (no elevation penalty)
// ---------------------------------------------------------------------------

describe('calcDuration — speed presets (flat)', () => {
  it('beginner speed (20 km/h) covers 20 km in exactly 1 hour', () => {
    expect(calcDuration(20, 0, SPEED_BEGINNER)).toBe('1시간')
  })

  it('intermediate speed (26.5 km/h) covers 26.5 km in exactly 1 hour', () => {
    expect(calcDuration(26.5, 0, SPEED_INTERMEDIATE)).toBe('1시간')
  })

  it('advanced speed (30 km/h) covers 30 km in exactly 1 hour', () => {
    expect(calcDuration(30, 0, SPEED_ADVANCED)).toBe('1시간')
  })

  it('exposes the documented speed constants', () => {
    expect(SPEED_BEGINNER).toBe(20)
    expect(SPEED_INTERMEDIATE).toBe(26.5)
    expect(SPEED_ADVANCED).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// Output formatting variations
// ---------------------------------------------------------------------------

describe('calcDuration — formatting', () => {
  it('returns minutes-only label when total is below one hour', () => {
    // 5 km / 20 km/h = 0.25 h → 15 min
    expect(calcDuration(5, 0, SPEED_BEGINNER)).toBe('15분')
  })

  it('returns hours-only label when minutes round to zero', () => {
    // 40 km / 20 km/h = 2 h
    expect(calcDuration(40, 0, SPEED_BEGINNER)).toBe('2시간')
  })

  it('returns combined hours + minutes label for fractional hours', () => {
    // 30 km / 20 km/h = 1.5 h → 1시간 30분
    expect(calcDuration(30, 0, SPEED_BEGINNER)).toBe('1시간 30분')
  })
})

// ---------------------------------------------------------------------------
// Elevation penalty
// ---------------------------------------------------------------------------

describe('calcDuration — elevation penalty', () => {
  it('applies a 10% slowdown per 500 m of elevation gain', () => {
    // 600 m → floor(600/500)*0.1 = 0.1 penalty → effective 18 km/h
    // 20 km / 18 km/h = 1.1111... h → 1 h + 7 min (round)
    expect(calcDuration(20, 600, SPEED_BEGINNER)).toBe('1시간 7분')
  })

  it('compounds the penalty for higher elevation gains', () => {
    // 1000 m → 0.2 penalty → effective 16 km/h → 1.25 h → 1시간 15분
    expect(calcDuration(20, 1000, SPEED_BEGINNER)).toBe('1시간 15분')
  })

  it('does not apply a penalty under the 500 m threshold', () => {
    // 499 m → floor(499/500)*0.1 = 0 → effective 20 km/h → 1 h
    expect(calcDuration(20, 499, SPEED_BEGINNER)).toBe('1시간')
  })

  it('clamps the effective speed to a minimum of 1 km/h for absurd elevations', () => {
    // huge penalty would push effective speed negative; clamp protects /0 and sign flips
    // 10 km @ 1 km/h → 10 h
    expect(calcDuration(10, 100_000, SPEED_BEGINNER)).toBe('10시간')
  })
})
