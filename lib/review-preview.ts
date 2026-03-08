import type { CourseReview } from '@/types/course'

/** Maximum number of reviews shown inline in the detail panel. */
export const REVIEW_PREVIEW_LIMIT = 3

/**
 * Slice the first `REVIEW_PREVIEW_LIMIT` reviews for inline preview display.
 */
export function getPreviewReviews(reviews: CourseReview[]): CourseReview[] {
  return reviews.slice(0, REVIEW_PREVIEW_LIMIT)
}

/**
 * Whether the "더보기" (show more) button should be visible.
 *
 * Only shown when there are more reviews than the inline preview limit.
 */
export function shouldShowMoreButton(reviews: CourseReview[]): boolean {
  return reviews.length > REVIEW_PREVIEW_LIMIT
}

/**
 * Fallback display values for a review author.
 */
export function getReviewAuthorDisplay(review: CourseReview): {
  name: string
  emoji: string
} {
  return {
    name: review.author_name ?? '라이더',
    emoji: review.author_emoji ?? '🙂',
  }
}
