import type { User } from '@supabase/supabase-js'

function parseAdminEmails(source: string | undefined) {
  return new Set(
    (source ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function getConfiguredAdminEmails() {
  return parseAdminEmails(
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS,
  )
}

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false
  return getConfiguredAdminEmails().has(email.toLowerCase())
}

export function isAdminUser(user: Pick<User, 'email'> | null | undefined) {
  return isAdminEmail(user?.email)
}

export function canEditCourse({
  courseOwnerId,
  userId,
  isAdmin,
}: {
  courseOwnerId: string | null | undefined
  userId: string | null | undefined
  isAdmin: boolean
}) {
  if (!userId) return false
  return isAdmin || (courseOwnerId != null && courseOwnerId === userId)
}
