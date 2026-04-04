'use client'

import { useCallback, useState } from 'react'
import { Locate, Loader2 } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { RegionPicker, type RegionSelection } from '@/components/region/region-picker'
import { useRegionContext } from '@/lib/region-context'

interface RegionSwitchDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RegionSwitchDrawer({ open, onOpenChange }: RegionSwitchDrawerProps) {
  const { currentRegionId, setTemporaryRegion } = useRegionContext()
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)

  const handleSelect = useCallback(
    (region: RegionSelection) => {
      setTemporaryRegion(region.id, region.name)
      onOpenChange(false)
    },
    [setTemporaryRegion, onOpenChange],
  )

  const handleGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('위치 서비스를 사용할 수 없습니다.')
      return
    }

    setGpsLoading(true)
    setGpsError(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch(
            `/api/regions/reverse?lat=${position.coords.latitude}&lng=${position.coords.longitude}`,
          )

          if (!res.ok) {
            throw new Error('역지오코딩 실패')
          }

          const region = (await res.json()) as { id: string; name: string; short_name: string } | null

          if (region) {
            setTemporaryRegion(region.id, region.name)
            onOpenChange(false)
          } else {
            setGpsError('현재 위치에 해당하는 지역을 찾을 수 없습니다.')
          }
        } catch {
          setGpsError('위치 정보를 처리할 수 없습니다.')
        } finally {
          setGpsLoading(false)
        }
      },
      () => {
        setGpsError('위치 권한이 필요합니다.')
        setGpsLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }, [setTemporaryRegion, onOpenChange])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHandle />
        <DrawerHeader>
          <DrawerTitle>지역 선택</DrawerTitle>
          <DrawerDescription>탐색할 지역을 선택하세요</DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleGps}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Locate className="h-4 w-4" />
            )}
            현재 위치로
          </Button>
          {gpsError && (
            <p className="mt-1.5 text-xs text-destructive">{gpsError}</p>
          )}
        </div>

        <div className="overflow-y-auto px-4 pb-4" style={{ maxHeight: '50vh' }}>
          <RegionPicker onSelect={handleSelect} selectedId={currentRegionId} />
        </div>

        <div className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
          기본 지역 변경은 프로필 설정에서 할 수 있어요
        </div>
      </DrawerContent>
    </Drawer>
  )
}
