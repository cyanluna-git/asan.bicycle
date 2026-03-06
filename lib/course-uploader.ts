import type { User } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { getUploaderDisplayName } from '@/lib/user-display-name'

type CourseWithUploader = {
  created_by: string | null
  uploader_name?: string | null
}

async function getDisplayNameByUserId(userId: string) {
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

  return getUploaderDisplayName(data.user as Pick<User, 'email' | 'user_metadata'>)
}

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
    missingOwnerIds.map(async (ownerId) => [ownerId, await getDisplayNameByUserId(ownerId)] as const),
  )

  const resolvedNames = new Map(
    resolvedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  )

  return courses.map((course) => ({
    ...course,
    uploader_name: course.uploader_name ?? resolvedNames.get(course.created_by ?? '') ?? null,
  }))
}
