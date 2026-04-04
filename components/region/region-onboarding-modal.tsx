'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { RegionPicker, type RegionSelection } from '@/components/region/region-picker'
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

  const handleSkip = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, 'true')
    setOpen(false)
  }, [])

  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) handleSkip() }}>
      <DrawerContent>
        <DrawerHandle />
        <DrawerHeader>
          <DrawerTitle>라이딩 홈 지역을 선택하세요</DrawerTitle>
          <DrawerDescription>가까운 코스를 먼저 만나볼 수 있어요</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-2" style={{ maxHeight: '50vh' }}>
          <RegionPicker onSelect={handleSelect} />
        </div>
        <DrawerFooter>
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            나중에 설정하기
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
