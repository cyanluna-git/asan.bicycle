import type { CourseReview } from '@/types/course'

export type ReviewSortOrder = 'latest' | 'oldest'

export function sortCourseReviews(
  reviews: CourseReview[],
  sortOrder: ReviewSortOrder,
) {
  return [...reviews].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime()
    const bTime = new Date(b.created_at).getTime()

    if (sortOrder === 'oldest') {
      return aTime - bTime
    }

    return bTime - aTime
  })
}
