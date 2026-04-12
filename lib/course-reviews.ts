import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { resolveProfileEmoji } from '@/lib/profile'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getUploaderDisplayName } from '@/lib/user-display-name'

type ReviewWithAuthor = {
  user_id: string
  author_name?: string | null
  author_emoji?: string | null
}

const getReviewAuthorByUserId = cache(async function getReviewAuthorByUserId(userId: string) {
  const supabase = createServiceRoleClient()

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId)

  if (error || !data.user) {
    if (error) {
      console.error('[course-reviews] failed to load user', userId, error.message)
    }

    return null
  }

  const user = data.user as Pick<User, 'id' | 'email' | 'user_metadata'>

  return {
    name: getUploaderDisplayName(user),
    emoji: resolveProfileEmoji(user),
  }
})

export async function hydrateCourseReviews<T extends ReviewWithAuthor>(reviews: T[]) {
  const missingUserIds = [...new Set(
    reviews
      .filter((review) => !review.author_name && review.user_id)
      .map((review) => review.user_id)
      .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0),
  )]

  if (missingUserIds.length === 0) {
    return reviews
  }

  const resolvedEntries = await Promise.all(
    missingUserIds.map(async (userId) => [userId, await getReviewAuthorByUserId(userId)] as const),
  )

  const resolvedProfiles = new Map(
    resolvedEntries.filter((entry): entry is readonly [string, { name: string; emoji: string }] => Boolean(entry[1])),
  )

  return reviews.map((review) => ({
    ...review,
    author_name: review.author_name ?? resolvedProfiles.get(review.user_id)?.name ?? null,
    author_emoji: review.author_emoji ?? resolvedProfiles.get(review.user_id)?.emoji ?? null,
  }))
}
