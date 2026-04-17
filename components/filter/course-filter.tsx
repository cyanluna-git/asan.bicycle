'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  type CourseFilterState,
  type DistancePreset,
  DISTANCE_PRESETS,
  countActiveFilters,
  defaultFilterState,
  parseFilterParams,
} from '@/lib/filter'

interface CourseFilterProps {
  startPoints: { id: string; name: string }[]
  mode?: 'default' | 'drawer'
  showHeading?: boolean
  className?: string
  onApplied?: () => void
}

export function CourseFilter({
  startPoints,
  mode = 'default',
  showHeading = true,
  className,
  onApplied,
}: CourseFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [state, setState] = useState<CourseFilterState>(() =>
    parseFilterParams(searchParams),
  )

  // Sync local state from searchParams when browser navigates back/forward
  useEffect(() => {
    setState(parseFilterParams(searchParams))
  }, [searchParams])

  const activeCount = countActiveFilters(state)

  // ---- handlers ----

  const applyFilters = useCallback(
    (nextState: CourseFilterState) => {
      const params = new URLSearchParams(searchParams.toString())

      if (nextState.startPoint) params.set('startPoint', nextState.startPoint)
      else params.delete('startPoint')

      if (nextState.distance) params.set('distance', nextState.distance)
      else params.delete('distance')

      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  const handleApply = () => {
    applyFilters(state)
    onApplied?.()
  }

  const handleResetAll = () => {
    const next = defaultFilterState()
    setState(next)
    applyFilters(next)
  }

  const handleRemoveStartPoint = () => {
    const next = { ...state, startPoint: null }
    setState(next)
    applyFilters(next)
  }

  const handleRemoveDistance = () => {
    const next = { ...state, distance: null }
    setState(next)
    applyFilters(next)
  }

  // ---- start point ----

  const onStartPointChange = (value: string) => {
    setState((prev) => ({ ...prev, startPoint: value || null }))
  }

  // ---- distance ----

  const toggleDistance = (preset: DistancePreset) => {
    setState((prev) => ({
      ...prev,
      distance: prev.distance === preset ? null : preset,
    }))
  }

  // ---- active filter labels for X buttons ----

  const startPointName =
    startPoints.find((sp) => sp.id === state.startPoint)?.name ?? null

  return (
    <div className={className}>
      {/* Heading + badge + reset */}
      {showHeading ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">필터</h2>
            {activeCount > 0 && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                {activeCount}
              </Badge>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={handleResetAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 초기화
            </button>
          )}
        </div>
      ) : activeCount > 0 ? (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={handleResetAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            전체 초기화
          </button>
        </div>
      ) : null}

      {/* Active filter chips with individual X */}
      {activeCount > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {startPointName && (
            <Badge variant="secondary" className="gap-1 pr-1">
              {startPointName}
              <button
                type="button"
                onClick={handleRemoveStartPoint}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          {state.distance && (
            <Badge variant="secondary" className="gap-1 pr-1">
              {DISTANCE_PRESETS[state.distance].label}
              <button
                type="button"
                onClick={handleRemoveDistance}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className={mode === 'drawer' ? 'flex flex-col gap-4' : 'flex flex-col gap-3'}>
        {/* Start Point Dropdown */}
        <div>
          <Label htmlFor="start-point-filter" className="text-xs text-muted-foreground">출발 기점</Label>
          <select
            id="start-point-filter"
            value={state.startPoint ?? ''}
            onChange={(e) => onStartPointChange(e.target.value)}
            disabled={startPoints.length === 0}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {startPoints.length === 0 ? (
              <option value="">기점 정보 없음</option>
            ) : (
              <>
                <option value="">전체</option>
                {startPoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Distance Preset Buttons */}
        <div>
          <label className="text-xs text-muted-foreground">거리</label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(
              Object.entries(DISTANCE_PRESETS) as [
                DistancePreset,
                (typeof DISTANCE_PRESETS)[DistancePreset],
              ][]
            ).map(([key, preset]) => (
              <Button
                key={key}
                type="button"
                variant={state.distance === key ? 'default' : 'outline'}
                size="sm"
                className={mode === 'drawer' ? 'h-9 rounded-full' : undefined}
                onClick={() => toggleDistance(key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Apply Button */}
        <Button
          type="button"
          onClick={handleApply}
          className={mode === 'drawer' ? 'mt-2 h-10 w-full rounded-full' : 'w-full mt-1'}
        >
          필터 적용
        </Button>
      </div>
    </div>
  )
}
