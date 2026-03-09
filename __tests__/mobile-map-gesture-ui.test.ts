import { describe, expect, it } from 'vitest'
import {
  getSheetGestureHint,
  shouldUseHandleOnlySheet,
} from '@/lib/mobile-map-gesture-ui'

describe('shouldUseHandleOnlySheet', () => {
  it('requires handle-only dragging when a course detail sheet is open', () => {
    expect(shouldUseHandleOnlySheet(true)).toBe(true)
  })

  it('does not force handle-only dragging for the course list sheet', () => {
    expect(shouldUseHandleOnlySheet(false)).toBe(false)
  })
})

describe('getSheetGestureHint', () => {
  it('returns a gesture hint when course detail and map interactions coexist', () => {
    expect(getSheetGestureHint(true)).toContain('손잡이')
    expect(getSheetGestureHint(true)).toContain('지도')
  })

  it('omits the hint for the plain course list state', () => {
    expect(getSheetGestureHint(false)).toBeNull()
  })
})
