import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

function requireValue(value: string | undefined, key: string) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export function createAnonServerClient(accessToken?: string) {
  const url = requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = requireValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return createClient<Database>(url, anonKey, accessToken
    ? {
        accessToken: async () => accessToken,
      }
    : undefined)
}

export function createServiceRoleClient() {
  const url = requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    return null
  }

  return createClient<Database>(url, serviceRoleKey)
}
