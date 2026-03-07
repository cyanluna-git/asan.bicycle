import { describe, expect, it } from 'vitest'
import { sortCourseReviews } from '@/lib/course-reviews-ui'
import type { CourseReview } from '@/types/course'

const REVIEWS: CourseReview[] = [
  {
    id: 'review-1',
    course_id: 'course-1',
    user_id: 'user-1',
    rating: 5,
    content: '첫 후기',
    ridden_at: null,
    perceived_difficulty: 'easy',
    condition_note: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    author_name: 'A',
    author_emoji: '🚴',
  },
  {
    id: 'review-2',
    course_id: 'course-1',
    user_id: 'user-2',
    rating: 4,
    content: '둘째 후기',
    ridden_at: null,
    perceived_difficulty: 'moderate',
    condition_note: null,
    created_at: '2026-03-02T10:00:00Z',
    updated_at: '2026-03-02T10:00:00Z',
    author_name: 'B',
    author_emoji: '🚵',
  },
]

describe('sortCourseReviews', () => {
  it('sorts latest first by default', () => {
    expect(sortCourseReviews(REVIEWS, 'latest').map((review) => review.id)).toEqual([
      'review-2',
      'review-1',
    ])
  })

  it('sorts oldest first', () => {
    expect(sortCourseReviews(REVIEWS, 'oldest').map((review) => review.id)).toEqual([
      'review-1',
      'review-2',
    ])
  })
})
