'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Locate, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type RegionSelection } from '@/components/region/region-picker'
import { upsertProfile } from '@/lib/profile'

interface RegionMapModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (region: RegionSelection) => void
  /** If provided, shows a "홈 지역으로 저장" checkbox for logged-in users */
  userId?: string | null
}

interface SidoMeta {
  code: string
  name: string
  shortName: string
}

const SVG_STYLE = `<style>
path { cursor: pointer; transition: fill 0.15s; }
path:hover { fill: #E8690A !important; }
path.selected { fill: #c85a08 !important; }
</style>`

function injectStyle(svgText: string): string {
  // Make SVG fill its container and inject interactive styles
  return svgText
    .replace(/\swidth="\d+"/, ' width="100%"')
    .replace(/\sheight="\d+"/, ' height="100%"')
    .replace(/<svg/, '<svg style="display:block" preserveAspectRatio="xMidYMid meet"')
    .replace(/(<svg[^>]*>)/, `$1${SVG_STYLE}`)
}

export function RegionMapModal({ open, onOpenChange, onSelect, userId }: RegionMapModalProps) {
  const [view, setView] = useState<'sido' | 'sigungu'>('sido')
  const [selectedSido, setSelectedSido] = useState<SidoMeta | null>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<RegionSelection | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [saveAsHome, setSaveAsHome] = useState(false)

  // GPS result buffered for after sigungu SVG loads
  const pendingGpsRegion = useRef<RegionSelection | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load SVG when view/sido changes
  useEffect(() => {
    if (!open) return

    const url = view === 'sido'
      ? '/maps/sido.svg'
      : `/maps/sigungu-${selectedSido!.code}.svg`

    setLoading(true)
    setError(null)
    setSvgContent(null)

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.text()
      })
      .then((text) => {
        setSvgContent(injectStyle(text))
      })
      .catch(() => {
        setError('지도를 불러올 수 없습니다')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [open, view, selectedSido, retryKey])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setView('sido')
      setSelectedSido(null)
      setSvgContent(null)
      setSelectedRegion(null)
      setError(null)
      setGpsError(null)
      setSaveAsHome(false)
      pendingGpsRegion.current = null
    }
  }, [open])

  // Apply .selected class to highlighted path after SVG renders
  useEffect(() => {
    if (!svgContent || !containerRef.current) return

    // Remove previous selection highlight
    const prev = containerRef.current.querySelector('path.selected')
    prev?.classList.remove('selected')

    // Apply pending GPS region if available
    if (pendingGpsRegion.current) {
      const region = pendingGpsRegion.current
      pendingGpsRegion.current = null
      setSelectedRegion(region)
      const path = containerRef.current.querySelector<Element>(
        `path[data-code="${region.code}"]`,
      )
      path?.classList.add('selected')
      return
    }

    // Apply current selectedRegion
    if (selectedRegion) {
      const path = containerRef.current.querySelector<Element>(
        `path[data-code="${selectedRegion.code}"]`,
      )
      path?.classList.add('selected')
    }
  }, [svgContent, selectedRegion])

  const handleMapClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element
      const path = target.closest?.('path[data-code]')
      if (!path) return

      const code = path.getAttribute('data-code') ?? ''
      const dataName = path.getAttribute('data-name') ?? ''
      const dataShort = path.getAttribute('data-short') ?? ''
      const dataId = path.getAttribute('data-id') ?? ''

      if (view === 'sido') {
        setSelectedSido({ code, name: dataName, shortName: dataShort })
        setView('sigungu')
        setSelectedRegion(null)
      } else {
        // Remove previous selected style
        containerRef.current?.querySelector('path.selected')?.classList.remove('selected')
        path.classList.add('selected')
        setSelectedRegion({
          id: dataId,
          name: dataName,
          shortName: dataShort,
          level: 'sigungu',
        } satisfies RegionSelection)
      }
    },
    [view],
  )

  const handleBack = useCallback(() => {
    setView('sido')
    setSelectedSido(null)
    setSelectedRegion(null)
    pendingGpsRegion.current = null
  }, [])

  const handleConfirm = useCallback(() => {
    if (!selectedRegion) return
    // Fire-and-forget home region save (doesn't block navigation)
    if (saveAsHome && userId) {
      void upsertProfile(userId, { home_region_id: selectedRegion.id })
    }
    onSelect(selectedRegion)
    onOpenChange(false)
  }, [selectedRegion, saveAsHome, userId, onSelect, onOpenChange])

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

          if (!res.ok) throw new Error('역지오코딩 실패')

          const region = (await res.json()) as { id: string; name: string; short_name: string } | null

          if (!region) {
            setGpsError('현재 위치에 해당하는 지역을 찾을 수 없습니다.')
            return
          }

          // region.id is a sigungu UUID; fetch its code to find the sido prefix
          const detailRes = await fetch(`/api/regions/${region.id}`)
          const detail = detailRes.ok
            ? ((await detailRes.json()) as { code?: string } | null)
            : null
          const sigunguCode = detail?.code ?? ''
          const sidoCode = sigunguCode.slice(0, 2)

          const gpsRegion: RegionSelection = {
            id: region.id,
            name: region.name,
            shortName: region.short_name,
            level: 'sigungu',
          }

          // Buffer GPS result; switch to sigungu view which will trigger SVG load
          pendingGpsRegion.current = gpsRegion
          setSelectedSido({ code: sidoCode, name: '', shortName: '' })
          setView('sigungu')
          setSelectedRegion(null)
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
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end bg-black/40 md:items-center md:justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex h-[92dvh] w-full flex-col bg-background md:h-auto md:max-h-[80vh] md:max-w-lg md:rounded-2xl md:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {view === 'sigungu' && (
            <button
              type="button"
              onClick={handleBack}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
              aria-label="뒤로"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="flex-1 text-sm font-semibold">
            {view === 'sido' ? '지역 선택' : selectedSido?.shortName || selectedSido?.name || '시군구 선택'}
          </span>
          {/* GPS button */}
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsLoading}
            className="flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
            aria-label="현재 위치"
          >
            {gpsLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Locate className="h-3.5 w-3.5" />
            )}
            내 위치
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* GPS error */}
        {gpsError && (
          <p className="px-4 pt-2 text-xs text-destructive">{gpsError}</p>
        )}

        {/* Map area */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {loading && (
            <div className="p-4">
              <div className="h-[360px] animate-pulse rounded-lg bg-muted" />
            </div>
          )}

          {error && !loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  setRetryKey((k) => k + 1)
                }}
              >
                다시 시도
              </Button>
            </div>
          )}

          {svgContent && !loading && !error && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div
              ref={containerRef}
              className="h-full w-full overflow-hidden p-2"
              onClick={handleMapClick}
              // svgContent is only ever loaded from /maps/*.svg (our own pre-built files)
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )}
        </div>

        {/* Bottom action bar */}
        {selectedRegion && (
          <div className="border-t bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">선택된 지역</p>
                <p className="truncate text-sm font-semibold">{selectedRegion.shortName || selectedRegion.name}</p>
                {userId && (
                  <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={saveAsHome}
                      onChange={(e) => setSaveAsHome(e.target.checked)}
                      className="h-3.5 w-3.5 rounded"
                    />
                    홈 지역으로 저장
                  </label>
                )}
              </div>
              <Button onClick={handleConfirm} className="shrink-0">
                여기 코스 탐색
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
