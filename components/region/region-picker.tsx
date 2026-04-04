'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RegionSelection = {
  id: string
  name: string
  shortName: string
  level: string
}

export interface RegionPickerProps {
  onSelect: (region: RegionSelection) => void
  selectedId?: string | null
  className?: string
}

type RegionItem = {
  id: string
  name: string
  short_name: string
  code: string
  level: 'sido' | 'sigungu'
  parent_id: string | null
}

async function fetchRegions(params: Record<string, string>): Promise<RegionItem[]> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/regions?${qs}`)
  if (!res.ok) {
    throw new Error('Failed to fetch regions')
  }
  return res.json() as Promise<RegionItem[]>
}

export function RegionPicker({ onSelect, selectedId, className }: RegionPickerProps) {
  const [step, setStep] = useState<'sido' | 'sigungu'>('sido')
  const [sidoList, setSidoList] = useState<RegionItem[]>([])
  const [sigunguList, setSigunguList] = useState<RegionItem[]>([])
  const [selectedSido, setSelectedSido] = useState<RegionItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchRegions({ level: 'sido' })
      .then((data) => {
        if (!cancelled) {
          setSidoList(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('지역 목록을 불러올 수 없습니다.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleSidoClick = useCallback((sido: RegionItem) => {
    setSelectedSido(sido)
    setStep('sigungu')
    setLoading(true)
    setError(null)

    fetchRegions({ parent_id: sido.id })
      .then((data) => {
        setSigunguList(data)
        setLoading(false)
      })
      .catch(() => {
        setError('시군구 목록을 불러올 수 없습니다.')
        setLoading(false)
      })
  }, [])

  const handleBack = useCallback(() => {
    setStep('sido')
    setSelectedSido(null)
    setSigunguList([])
    setError(null)
  }, [])

  const handleSigunguClick = useCallback(
    (sigungu: RegionItem) => {
      onSelect({
        id: sigungu.id,
        name: sigungu.name,
        shortName: sigungu.short_name,
        level: sigungu.level,
      })
    },
    [onSelect],
  )

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-10 text-sm text-muted-foreground', className)}>
        <p>{error}</p>
        <button
          type="button"
          className="mt-2 text-primary underline-offset-4 hover:underline"
          onClick={() => {
            if (step === 'sido') {
              setLoading(true)
              setError(null)
              fetchRegions({ level: 'sido' })
                .then(setSidoList)
                .catch(() => setError('지역 목록을 불러올 수 없습니다.'))
                .finally(() => setLoading(false))
            } else if (selectedSido) {
              handleSidoClick(selectedSido)
            }
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }

  if (step === 'sido') {
    return (
      <div className={cn('flex flex-col', className)}>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {sidoList.map((sido) => (
              <button
                key={sido.id}
                type="button"
                onClick={() => handleSidoClick(sido)}
                className={cn(
                  'flex min-h-[44px] items-center justify-center rounded-lg border px-2 py-3 text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  selectedId === sido.id && 'border-primary bg-primary/5 text-primary',
                )}
              >
                {sido.short_name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={handleBack}
        className="mb-3 flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {selectedSido?.short_name ?? '시도 선택'}
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {sigunguList.map((sigungu) => (
            <button
              key={sigungu.id}
              type="button"
              onClick={() => handleSigunguClick(sigungu)}
              className={cn(
                'flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                selectedId === sigungu.id && 'bg-primary/5 font-medium text-primary',
              )}
            >
              {sigungu.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
