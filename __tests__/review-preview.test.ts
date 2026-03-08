import { describe, expect, it } from 'vitest'
import { summarizeText } from '@/lib/text'
import {
  getPreviewReviews,
  getReviewAuthorDisplay,
  REVIEW_PREVIEW_LIMIT,
  shouldShowMoreButton,
} from '@/lib/review-preview'
import type { CourseReview } from '@/types/course'

// ---------------------------------------------------------------------------
// Test data helpers
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
    makeReview({ id: `review-${i + 1}`, rating: (i % 5) + 1 }),
  )
}

// ---------------------------------------------------------------------------
// summarizeText
// ---------------------------------------------------------------------------

describe('summarizeText', () => {
  it('returns null for null input', () => {
    expect(summarizeText(null, 92)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(summarizeText(undefined, 92)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(summarizeText('', 92)).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(summarizeText('   \n\t  ', 92)).toBeNull()
  })

  it('returns the original text when under maxLength', () => {
    expect(summarizeText('짧은 텍스트', 92)).toBe('짧은 텍스트')
  })

  it('returns the original text when exactly at maxLength', () => {
    const text = 'a'.repeat(92)
    expect(summarizeText(text, 92)).toBe(text)
  })

  it('truncates with ellipsis when over maxLength', () => {
    const text = 'a'.repeat(100)
    const result = summarizeText(text, 92)!
    expect(result).toHaveLength(92)
    expect(result.endsWith('…')).toBe(true)
    expect(result).toBe('a'.repeat(91) + '…')
  })

  it('normalizes internal whitespace before truncating', () => {
    const text = '가 나  다   라    마'
    const result = summarizeText(text, 100)
    expect(result).toBe('가 나 다 라 마')
  })

  it('trims leading/trailing whitespace', () => {
    expect(summarizeText('  안녕하세요  ', 100)).toBe('안녕하세요')
  })

  it('trims trailing whitespace at truncation boundary', () => {
    // Build a string where the slice boundary lands after a space
    const text = 'hello world this is a test string'
    const result = summarizeText(text, 12)
    // slice(0, 11) = "hello world" -> trimEnd -> "hello world" + "…"
    expect(result).toBe('hello world…')
    expect(result!.length).toBeLessThanOrEqual(12)
  })

  it('handles very long content (review excerpt scenario at 92 chars)', () => {
    const longContent =
      '이 코스는 아산시에서 온양온천을 거쳐 신정호까지 이어지는 아름다운 자전거 경로입니다. 호수 주변의 경치가 매우 좋으며 중간에 쉬어갈 수 있는 카페도 여러 곳 있습니다.'
    const result = summarizeText(longContent, 92)!
    expect(result.length).toBeLessThanOrEqual(92)
    expect(result.endsWith('…')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getPreviewReviews
// ---------------------------------------------------------------------------

describe('getPreviewReviews', () => {
  it('returns empty array when no reviews', () => {
    expect(getPreviewReviews([])).toEqual([])
  })

  it('returns all reviews when count is 1', () => {
    const reviews = makeReviews(1)
    expect(getPreviewReviews(reviews)).toHaveLength(1)
  })

  it('returns all reviews when count is 2', () => {
    const reviews = makeReviews(2)
    expect(getPreviewReviews(reviews)).toHaveLength(2)
  })

  it('returns all reviews when count equals the limit (3)', () => {
    const reviews = makeReviews(3)
    expect(getPreviewReviews(reviews)).toHaveLength(3)
  })

  it('returns only first 3 reviews when count is 4', () => {
    const reviews = makeReviews(4)
    const preview = getPreviewReviews(reviews)
    expect(preview).toHaveLength(3)
    expect(preview.map((r) => r.id)).toEqual([
      'review-1',
      'review-2',
      'review-3',
    ])
  })

  it('returns only first 3 reviews when count is 10', () => {
    const reviews = makeReviews(10)
    expect(getPreviewReviews(reviews)).toHaveLength(3)
  })

  it('REVIEW_PREVIEW_LIMIT is 3', () => {
    expect(REVIEW_PREVIEW_LIMIT).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// shouldShowMoreButton
// ---------------------------------------------------------------------------

describe('shouldShowMoreButton', () => {
  it('returns false for 0 reviews', () => {
    expect(shouldShowMoreButton([])).toBe(false)
  })

  it('returns false for 1 review', () => {
    expect(shouldShowMoreButton(makeReviews(1))).toBe(false)
  })

  it('returns false for 2 reviews', () => {
    expect(shouldShowMoreButton(makeReviews(2))).toBe(false)
  })

  it('returns false for exactly 3 reviews', () => {
    expect(shouldShowMoreButton(makeReviews(3))).toBe(false)
  })

  it('returns true for 4 reviews', () => {
    expect(shouldShowMoreButton(makeReviews(4))).toBe(true)
  })

  it('returns true for 10 reviews', () => {
    expect(shouldShowMoreButton(makeReviews(10))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getReviewAuthorDisplay
// ---------------------------------------------------------------------------

describe('getReviewAuthorDisplay', () => {
  it('returns actual author_name and author_emoji when present', () => {
    const review = makeReview({
      author_name: '김철수',
      author_emoji: '🚵',
    })
    const { name, emoji } = getReviewAuthorDisplay(review)
    expect(name).toBe('김철수')
    expect(emoji).toBe('🚵')
  })

  it('falls back to "라이더" when author_name is null', () => {
    const review = makeReview({ author_name: null })
    expect(getReviewAuthorDisplay(review).name).toBe('라이더')
  })

  it('falls back to default emoji when author_emoji is null', () => {
    const review = makeReview({ author_emoji: null })
    expect(getReviewAuthorDisplay(review).emoji).toBe('🙂')
  })

  it('falls back to both defaults when both are null', () => {
    const review = makeReview({ author_name: null, author_emoji: null })
    const { name, emoji } = getReviewAuthorDisplay(review)
    expect(name).toBe('라이더')
    expect(emoji).toBe('🙂')
  })
})
