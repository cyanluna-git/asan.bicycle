'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'

interface RegionContextValue {
  currentRegionId: string | null
  currentRegionName: string | null
  isTemporary: boolean
  setTemporaryRegion: (id: string, name: string) => void
  clearTemporaryRegion: () => void
}

const RegionContext = createContext<RegionContextValue>({
  currentRegionId: null,
  currentRegionName: null,
  isTemporary: false,
  setTemporaryRegion: () => {},
  clearTemporaryRegion: () => {},
})

export function useRegionContext(): RegionContextValue {
  return useContext(RegionContext)
}

const TEMP_ID_KEY = 'temporary_region_id'
const TEMP_NAME_KEY = 'temporary_region_name'

export function RegionProvider({ children }: { children: ReactNode }) {
  const [homeRegionId, setHomeRegionId] = useState<string | null>(null)
  const [homeRegionName, setHomeRegionName] = useState<string | null>(null)
  const [tempRegionId, setTempRegionId] = useState<string | null>(null)
  const [tempRegionName, setTempRegionName] = useState<string | null>(null)

  useEffect(() => {
    const storedId = sessionStorage.getItem(TEMP_ID_KEY)
    const storedName = sessionStorage.getItem(TEMP_NAME_KEY)
    if (storedId && storedName) {
      setTempRegionId(storedId)
      setTempRegionName(storedName)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadHomeRegion() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session?.user) return

      const { data } = await supabase
        .from('user_profiles')
        .select('home_region_id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled || !data?.home_region_id) return

      const { data: region } = await supabase
        .from('regions')
        .select('id, name, short_name, parent_id')
        .eq('id', data.home_region_id)
        .maybeSingle()

      if (cancelled || !region) return

      let displayName = region.name
      if (region.parent_id) {
        const { data: parent } = await supabase
          .from('regions')
          .select('short_name')
          .eq('id', region.parent_id)
          .maybeSingle()

        if (parent) {
          displayName = `${parent.short_name} ${region.name}`
        }
      }

      setHomeRegionId(region.id)
      setHomeRegionName(displayName)
    }

    void loadHomeRegion()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadHomeRegion()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const setTemporaryRegion = useCallback((id: string, name: string) => {
    setTempRegionId(id)
    setTempRegionName(name)
    sessionStorage.setItem(TEMP_ID_KEY, id)
    sessionStorage.setItem(TEMP_NAME_KEY, name)
  }, [])

  const clearTemporaryRegion = useCallback(() => {
    setTempRegionId(null)
    setTempRegionName(null)
    sessionStorage.removeItem(TEMP_ID_KEY)
    sessionStorage.removeItem(TEMP_NAME_KEY)
  }, [])

  const value = useMemo<RegionContextValue>(
    () => ({
      currentRegionId: tempRegionId ?? homeRegionId,
      currentRegionName: tempRegionName ?? homeRegionName,
      isTemporary: tempRegionId !== null,
      setTemporaryRegion,
      clearTemporaryRegion,
    }),
    [homeRegionId, homeRegionName, tempRegionId, tempRegionName, setTemporaryRegion, clearTemporaryRegion],
  )

  return (
    <RegionContext.Provider value={value}>
      {children}
    </RegionContext.Provider>
  )
}
