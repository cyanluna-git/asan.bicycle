'use client'

import { useCallback, useEffect, useState } from 'react'
import { RegionMapModal } from '@/components/region/region-map-modal'
import { type RegionSelection } from '@/components/region/region-picker'
import { upsertProfile } from '@/lib/profile'
import { supabase } from '@/lib/supabase'

const SESSION_KEY = 'region_onboarding_skipped'

export function RegionOnboardingModal() {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session?.user) return

      if (sessionStorage.getItem(SESSION_KEY) === 'true') return

      const { data } = await supabase
        .from('user_profiles')
        .select('home_region_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (data && data.home_region_id === null) {
        setUserId(session.user.id)
        setOpen(true)
      }
    }

    void check()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSelect = useCallback(
    async (region: RegionSelection) => {
      if (!userId) return
      await upsertProfile(userId, { home_region_id: region.id })
      setOpen(false)
    },
    [userId],
  )

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      // User dismissed without selecting — mark as skipped
      sessionStorage.setItem(SESSION_KEY, 'true')
    }
    setOpen(next)
  }, [])

  return (
    <RegionMapModal
      open={open}
      onOpenChange={handleOpenChange}
      onSelect={handleSelect}
    />
  )
}
