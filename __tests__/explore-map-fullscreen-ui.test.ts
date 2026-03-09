import { describe, expect, it } from 'vitest'
import {
  canEnterMapFullscreen,
  getCourseSheetTriggerLabel,
  shouldExitMapFullscreen,
} from '@/lib/explore-map-fullscreen-ui'

describe('canEnterMapFullscreen', () => {
  it('allows fullscreen when a course is selected and no mobile surface is open', () => {
    expect(
      canEnterMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: null,
      }),
    ).toBe(true)
  })

  it('blocks fullscreen when no course is selected', () => {
    expect(
      canEnterMapFullscreen({
        hasSelectedCourse: false,
        activeSurfaceKind: null,
      }),
    ).toBe(false)
  })

  it('blocks fullscreen while review or album surfaces are open', () => {
    expect(
      canEnterMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: 'review',
      }),
    ).toBe(false)

    expect(
      canEnterMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: 'album',
      }),
    ).toBe(false)
  })
})

describe('shouldExitMapFullscreen', () => {
  it('keeps fullscreen active only while a course is selected, no surface is open, and the sheet stays closed', () => {
    expect(
      shouldExitMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: null,
        isCourseSheetOpen: false,
      }),
    ).toBe(false)
  })

  it('forces fullscreen exit when the course sheet opens', () => {
    expect(
      shouldExitMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: null,
        isCourseSheetOpen: true,
      }),
    ).toBe(true)
  })

  it('forces fullscreen exit when the selected course disappears or a surface opens', () => {
    expect(
      shouldExitMapFullscreen({
        hasSelectedCourse: false,
        activeSurfaceKind: null,
        isCourseSheetOpen: false,
      }),
    ).toBe(true)

    expect(
      shouldExitMapFullscreen({
        hasSelectedCourse: true,
        activeSurfaceKind: 'review',
        isCourseSheetOpen: false,
      }),
    ).toBe(true)
  })
})

describe('getCourseSheetTriggerLabel', () => {
  it('uses a detail-oriented label when a course is selected', () => {
    expect(getCourseSheetTriggerLabel(true)).toBe('코스 정보 보기')
  })

  it('uses the list label when no course is selected', () => {
    expect(getCourseSheetTriggerLabel(false)).toBe('코스 목록 보기')
  })
})
