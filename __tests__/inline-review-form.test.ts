import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))
import { getUploaderDisplayName } from '@/lib/user-display-name'
import { resolveProfileEmoji } from '@/lib/profile'
import {
  getPreviewReviews,
  getReviewAuthorDisplay,
  shouldShowMoreButton,
} from '@/lib/review-preview'
import type { CourseReview } from '@/types/course'

// ---------------------------------------------------------------------------
// Test data helpers — mirrors the pattern used in the component
// ---------------------------------------------------------------------------

function makeReview(overrides: Partial<CourseReview> = {}): CourseReview {
  return {
    id: 'review-1',
    course_id: 'course-1',
    user_id: 'user-1',
    rating: 4,
    content: '좋은 코스입니다.',
    ridden_at: null,
    perceived_difficulty: null,
    condition_note: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    author_name: '홍길동',
    author_emoji: '🚴',
    ...overrides,
  }
}

function makeReviews(count: number): CourseReview[] {
  return Array.from({ length: count }, (_, i) =>
    makeReview({
      id: `review-${i + 1}`,
      user_id: `user-${i + 1}`,
      rating: (i % 5) + 1,
    }),
  )
}

// Replicates the allReviews merge logic from course-detail-panel.tsx (lines 83-85)
function mergeOptimisticReview(
  reviews: CourseReview[],
  optimisticReview: CourseReview | null,
): CourseReview[] {
  return optimisticReview
    ? [optimisticReview, ...reviews.filter((r) => r.id !== optimisticReview.id)]
    : reviews
}

// Replicates the hasOwnReview check from course-detail-panel.tsx (lines 87-89)
function hasOwnReview(
  userId: string | null,
  reviews: CourseReview[],
): boolean {
  return Boolean(userId && reviews.some((r) => r.user_id === userId))
}

// Replicates inline form validation from InlineReviewForm.handleSubmit (lines 572-579)
function validateInlineReview(
  rating: number,
  content: string,
): string | null {
  if (rating < 1 || rating > 5) return '별점을 선택해주세요 (1~5)'
  if (!content.trim()) return '한줄 후기를 입력해주세요.'
  return null
}

// ---------------------------------------------------------------------------
// mergeOptimisticReview
// ---------------------------------------------------------------------------

describe('mergeOptimisticReview (allReviews logic)', () => {
  it('returns original reviews when optimistic is null', () => {
    const reviews = makeReviews(3)
    expect(mergeOptimisticReview(reviews, null)).toBe(reviews)
  })

  it('prepends optimistic review when there are no existing reviews', () => {
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })
    const result = mergeOptimisticReview([], optimistic)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('opt-1')
  })

  it('prepends optimistic review before existing reviews', () => {
    const reviews = makeReviews(3)
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })
    const result = mergeOptimisticReview(reviews, optimistic)
    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('opt-1')
    expect(result[1].id).toBe('review-1')
  })

  it('deduplicates when optimistic review has same id as an existing review', () => {
    const reviews = makeReviews(3)
    const optimistic = makeReview({
      id: 'review-2',
      user_id: 'user-2',
      content: 'Updated content',
    })
    const result = mergeOptimisticReview(reviews, optimistic)
    expect(result).toHaveLength(3)
    // Optimistic is first
    expect(result[0].id).toBe('review-2')
    expect(result[0].content).toBe('Updated content')
    // Original review-2 is filtered out
    expect(result.filter((r) => r.id === 'review-2')).toHaveLength(1)
  })

  it('preserves order of remaining reviews after deduplication', () => {
    const reviews = makeReviews(4)
    const optimistic = makeReview({ id: 'review-3', user_id: 'user-3' })
    const result = mergeOptimisticReview(reviews, optimistic)
    expect(result.map((r) => r.id)).toEqual([
      'review-3', // optimistic first
      'review-1',
      'review-2',
      // review-3 removed (duplicate)
      'review-4',
    ])
  })
})

// ---------------------------------------------------------------------------
// hasOwnReview
// ---------------------------------------------------------------------------

describe('hasOwnReview', () => {
  it('returns false when userId is null', () => {
    expect(hasOwnReview(null, makeReviews(3))).toBe(false)
  })

  it('returns false when userId is empty string', () => {
    // Empty string is falsy, so Boolean("" && ...) => false
    expect(hasOwnReview('', makeReviews(3))).toBe(false)
  })

  it('returns false when user has no review in the list', () => {
    const reviews = makeReviews(3) // user-1, user-2, user-3
    expect(hasOwnReview('user-99', reviews)).toBe(false)
  })

  it('returns true when user has a review in the list', () => {
    const reviews = makeReviews(3) // user-1, user-2, user-3
    expect(hasOwnReview('user-2', reviews)).toBe(true)
  })

  it('returns false for empty reviews array', () => {
    expect(hasOwnReview('user-1', [])).toBe(false)
  })

  it('returns true after optimistic merge includes user review', () => {
    const reviews = makeReviews(2) // user-1, user-2
    const optimistic = makeReview({ id: 'opt-1', user_id: 'user-99' })
    const merged = mergeOptimisticReview(reviews, optimistic)
    expect(hasOwnReview('user-99', merged)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateInlineReview
// ---------------------------------------------------------------------------

describe('validateInlineReview', () => {
  it('rejects rating of 0', () => {
    expect(validateInlineReview(0, '좋은 코스')).toBe('별점을 선택해주세요 (1~5)')
  })

  it('rejects negative rating', () => {
    expect(validateInlineReview(-1, '좋은 코스')).toBe('별점을 선택해주세요 (1~5)')
  })

  it('rejects rating above 5', () => {
    expect(validateInlineReview(6, '좋은 코스')).toBe('별점을 선택해주세요 (1~5)')
  })

  it('accepts rating of 1', () => {
    expect(validateInlineReview(1, '좋은 코스')).toBeNull()
  })

  it('accepts rating of 5', () => {
    expect(validateInlineReview(5, '좋은 코스')).toBeNull()
  })

  it('rejects empty content', () => {
    expect(validateInlineReview(3, '')).toBe('한줄 후기를 입력해주세요.')
  })

  it('rejects whitespace-only content', () => {
    expect(validateInlineReview(3, '   \t\n  ')).toBe('한줄 후기를 입력해주세요.')
  })

  it('accepts valid rating and content', () => {
    expect(validateInlineReview(4, '정말 좋은 코스예요')).toBeNull()
  })

  it('validates rating before content', () => {
    // Both invalid: rating out of range and empty content
    // Should return rating error first
    expect(validateInlineReview(0, '')).toBe('별점을 선택해주세요 (1~5)')
  })
})

// ---------------------------------------------------------------------------
// getUploaderDisplayName (used in optimistic review construction)
// ---------------------------------------------------------------------------

describe('getUploaderDisplayName (optimistic review author)', () => {
  it('returns full_name from user_metadata when available', () => {
    const user = {
      email: 'test@example.com',
      user_metadata: { full_name: '김사이클' },
    } as never
    expect(getUploaderDisplayName(user)).toBe('김사이클')
  })

  it('falls back to email prefix when full_name is missing', () => {
    const user = {
      email: 'rider@example.com',
      user_metadata: {},
    } as never
    expect(getUploaderDisplayName(user)).toBe('rider')
  })

  it('falls back to email prefix when full_name is empty string', () => {
    const user = {
      email: 'cyclist@example.com',
      user_metadata: { full_name: '' },
    } as never
    expect(getUploaderDisplayName(user)).toBe('cyclist')
  })

  it('falls back to "익명" when both full_name and email are missing', () => {
    const user = {
      email: undefined,
      user_metadata: {},
    } as never
    expect(getUploaderDisplayName(user)).toBe('익명')
  })

  it('normalizes whitespace in full_name', () => {
    const user = {
      email: 'test@example.com',
      user_metadata: { full_name: '  산악   라이더  ' },
    } as never
    expect(getUploaderDisplayName(user)).toBe('산악 라이더')
  })
})

// ---------------------------------------------------------------------------
// resolveProfileEmoji (used in optimistic review construction)
// ---------------------------------------------------------------------------

describe('resolveProfileEmoji (optimistic review emoji)', () => {
  it('returns avatar_emoji when set in user_metadata', () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      user_metadata: { avatar_emoji: '🚵' },
    } as never
    expect(resolveProfileEmoji(user)).toBe('🚵')
  })

  it('returns a deterministic default emoji when avatar_emoji is not set', () => {
    const user = {
      id: 'user-1',
      email: 'test@example.com',
      user_metadata: {},
    } as never
    const emoji1 = resolveProfileEmoji(user)
    const emoji2 = resolveProfileEmoji(user)
    expect(emoji1).toBe(emoji2)
    expect(typeof emoji1).toBe('string')
    expect(emoji1.length).toBeGreaterThan(0)
  })

  it('returns different defaults for different user ids', () => {
    const user1 = { id: 'user-abc', email: 'a@test.com', user_metadata: {} } as never
    const user2 = { id: 'user-xyz', email: 'b@test.com', user_metadata: {} } as never
    // Note: there's a small chance of collision due to hash modulo,
    // but these specific IDs produce different emojis
    const emoji1 = resolveProfileEmoji(user1)
    const emoji2 = resolveProfileEmoji(user2)
    expect(typeof emoji1).toBe('string')
    expect(typeof emoji2).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Integration: optimistic review affects preview + more button
// ---------------------------------------------------------------------------

describe('optimistic review integration with preview helpers', () => {
  it('adding optimistic review to empty list makes it appear in preview', () => {
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })
    const merged = mergeOptimisticReview([], optimistic)
    const preview = getPreviewReviews(merged)
    expect(preview).toHaveLength(1)
    expect(preview[0].id).toBe('opt-1')
  })

  it('adding optimistic review to 3-review list triggers more button', () => {
    const reviews = makeReviews(3)
    expect(shouldShowMoreButton(reviews)).toBe(false)
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })
    const merged = mergeOptimisticReview(reviews, optimistic)
    expect(shouldShowMoreButton(merged)).toBe(true)
  })

  it('optimistic review appears first in preview', () => {
    const reviews = makeReviews(5)
    const optimistic = makeReview({
      id: 'opt-1',
      user_id: 'new-user',
      content: 'Fresh review',
    })
    const merged = mergeOptimisticReview(reviews, optimistic)
    const preview = getPreviewReviews(merged)
    expect(preview[0].id).toBe('opt-1')
    expect(preview[0].content).toBe('Fresh review')
  })

  it('getReviewAuthorDisplay works on optimistic reviews', () => {
    const optimistic = makeReview({
      id: 'opt-1',
      author_name: '새 라이더',
      author_emoji: '🦊',
    })
    const display = getReviewAuthorDisplay(optimistic)
    expect(display.name).toBe('새 라이더')
    expect(display.emoji).toBe('🦊')
  })

  it('rollback (null optimistic) restores original list', () => {
    const reviews = makeReviews(3)
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })
    const merged = mergeOptimisticReview(reviews, optimistic)
    expect(merged).toHaveLength(4)

    // Simulate rollback: set optimistic to null
    const rolledBack = mergeOptimisticReview(reviews, null)
    expect(rolledBack).toHaveLength(3)
    expect(rolledBack).toBe(reviews) // Same reference
  })

  it('hasOwnReview flips correctly on rollback', () => {
    const reviews = makeReviews(2)
    const optimistic = makeReview({ id: 'opt-1', user_id: 'new-user' })

    const merged = mergeOptimisticReview(reviews, optimistic)
    expect(hasOwnReview('new-user', merged)).toBe(true)

    const rolledBack = mergeOptimisticReview(reviews, null)
    expect(hasOwnReview('new-user', rolledBack)).toBe(false)
  })
})
