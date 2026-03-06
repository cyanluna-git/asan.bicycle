import type { User } from '@supabase/supabase-js'

function getEmailPrefix(email: string | null | undefined) {
  if (!email) return '익명'

  const [prefix] = email.split('@')
  return prefix || '익명'
}

export function getUploaderDisplayName(user: Pick<User, 'email' | 'user_metadata'>) {
  const fullName = typeof user.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : ''

  return fullName || getEmailPrefix(user.email)
}
