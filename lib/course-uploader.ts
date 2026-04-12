import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { resolveProfileEmoji } from '@/lib/profile'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getUploaderDisplayName } from '@/lib/user-display-name'

type CourseWithUploader = {
  created_by: string | null
  uploader_name?: string | null
  uploader_emoji?: string | null
}

const getProfileIdentityByUserId = cache(async function getProfileIdentityByUserId(userId: string) {
  const supabase = createServiceRoleClient()

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.admin.getUserById(userId)

  if (error || !data.user) {
    if (error) {
      console.error('[course-uploader] failed to load user', userId, error.message)
    }

    return null
  }

  const user = data.user as Pick<User, 'id' | 'email' | 'user_metadata'>

  return {
    name: getUploaderDisplayName(user),
    emoji: resolveProfileEmoji(user),
  }
})

export async function hydrateUploaderNames<T extends CourseWithUploader>(courses: T[]) {
  const missingOwnerIds = [...new Set(
    courses
      .filter((course) => !course.uploader_name && course.created_by)
      .map((course) => course.created_by)
      .filter((ownerId): ownerId is string => typeof ownerId === 'string' && ownerId.length > 0),
  )]

  if (missingOwnerIds.length === 0) {
    return courses
  }

  const resolvedEntries = await Promise.all(
    missingOwnerIds.map(async (ownerId) => [ownerId, await getProfileIdentityByUserId(ownerId)] as const),
  )

  const resolvedProfiles = new Map(
    resolvedEntries.filter((entry): entry is readonly [string, { name: string; emoji: string }] => Boolean(entry[1])),
  )

  return courses.map((course) => ({
    ...course,
    uploader_name: course.uploader_name ?? resolvedProfiles.get(course.created_by ?? '')?.name ?? null,
    uploader_emoji: course.uploader_emoji ?? resolvedProfiles.get(course.created_by ?? '')?.emoji ?? null,
  }))
}
