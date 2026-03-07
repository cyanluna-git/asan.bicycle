import { describe, expect, it } from 'vitest'
import {
  getReviewEmptyStateCopy,
  getReviewSurfaceIntroCopy,
  getReviewSurfaceViewerState,
  shouldRestoreCourseSheet,
} from '@/lib/course-reviews-surface-ui'

describe('course review surface UI helpers', () => {
  describe('getReviewSurfaceViewerState', () => {
    it('returns guest when logged out', () => {
      expect(
        getReviewSurfaceViewerState({ isLoggedIn: false, hasOwnReview: false }),
      ).toBe('guest')
    })

    it('returns own-review when the viewer already wrote a review', () => {
      expect(
        getReviewSurfaceViewerState({ isLoggedIn: true, hasOwnReview: true }),
      ).toBe('own-review')
    })

    it('returns member for logged-in users without a review', () => {
      expect(
        getReviewSurfaceViewerState({ isLoggedIn: true, hasOwnReview: false }),
      ).toBe('member')
    })
  })

  describe('getReviewSurfaceIntroCopy', () => {
    it('prioritizes guest copy', () => {
      expect(
        getReviewSurfaceIntroCopy({ viewerState: 'guest', reviewCount: 3 }),
      ).toContain('로그인')
    })

    it('returns first-review copy when there are no reviews yet', () => {
      expect(
        getReviewSurfaceIntroCopy({ viewerState: 'member', reviewCount: 0 }),
      ).toContain('첫 라이더 후기')
    })
  })

  describe('getReviewEmptyStateCopy', () => {
    it('returns dedicated copy for the owner state', () => {
      expect(getReviewEmptyStateCopy('own-review')).toContain('내 후기')
    })
  })

  describe('shouldRestoreCourseSheet', () => {
    it('restores the sheet only for mobile bottom-sheet flows', () => {
      expect(
        shouldRestoreCourseSheet({
          source: 'bottom-sheet',
          hasSelectedCourse: true,
        }),
      ).toBe(true)

      expect(
        shouldRestoreCourseSheet({
          source: 'sidebar',
          hasSelectedCourse: true,
        }),
      ).toBe(false)
    })
  })
})
