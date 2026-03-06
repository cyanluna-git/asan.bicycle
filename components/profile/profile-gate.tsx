'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { ProfileEditor } from '@/components/profile/profile-editor'
import { isProfileComplete } from '@/lib/profile'
import { supabase } from '@/lib/supabase'

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }).catch(() => {
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      {children}
      {!authLoading && user && !isProfileComplete(user) && (
        <ProfileEditor user={user} mode="onboarding" />
      )}
    </>
  )
}
