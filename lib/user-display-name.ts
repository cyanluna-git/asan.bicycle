import type { User } from '@supabase/supabase-js'
import { getProfileName } from '@/lib/profile'

function getEmailPrefix(email: string | null | undefined) {
  if (!email) return '익명'

  const [prefix] = email.split('@')
  return prefix || '익명'
}

export function getUploaderDisplayName(user: Pick<User, 'email' | 'user_metadata'>) {
  return getProfileName(user) || getEmailPrefix(user.email)
}
