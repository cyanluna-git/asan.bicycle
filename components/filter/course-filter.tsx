'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  type CourseFilterState,
  type DistancePreset,
  DIFFICULTY_OPTIONS,
  DISTANCE_PRESETS,
  buildFilterQuery,
  countActiveFilters,
  defaultFilterState,
  parseFilterParams,
} from '@/lib/filter'
import type { Enums } from '@/types/database'

interface CourseFilterProps {
  startPoints: { id: string; name: string }[]
  themes: string[]
}

export function CourseFilter({ startPoints, themes }: CourseFilterProps) {
  const router = useRouter()
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
      const qs = buildFilterQuery(nextState)
      router.replace(qs ? `?${qs}` : '/', { scroll: false })
    },
    [router],
  )

  const handleApply = () => applyFilters(state)

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

  const handleRemoveDifficulty = () => {
    const next = { ...state, difficulty: [] }
    setState(next)
    applyFilters(next)
  }

  const handleRemoveDistance = () => {
    const next = { ...state, distance: null }
    setState(next)
    applyFilters(next)
  }

  const handleRemoveThemes = () => {
    const next = { ...state, themes: [] }
    setState(next)
    applyFilters(next)
  }

  // ---- start point ----

  const onStartPointChange = (value: string) => {
    setState((prev) => ({ ...prev, startPoint: value || null }))
  }

  // ---- difficulty ----

  const toggleDifficulty = (value: Enums<'course_difficulty'>) => {
    setState((prev) => {
      const has = prev.difficulty.includes(value)
      return {
        ...prev,
        difficulty: has
          ? prev.difficulty.filter((d) => d !== value)
          : [...prev.difficulty, value],
      }
    })
  }

  // ---- distance ----

  const toggleDistance = (preset: DistancePreset) => {
    setState((prev) => ({
      ...prev,
      distance: prev.distance === preset ? null : preset,
    }))
  }

  // ---- theme ----

  const toggleTheme = (theme: string) => {
    setState((prev) => {
      const has = prev.themes.includes(theme)
      return {
        ...prev,
        themes: has
          ? prev.themes.filter((t) => t !== theme)
          : [...prev.themes, theme],
      }
    })
  }

  // ---- active filter labels for X buttons ----

  const startPointName =
    startPoints.find((sp) => sp.id === state.startPoint)?.name ?? null

  return (
    <div className="mb-6">
      {/* Heading + badge + reset */}
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
          {state.difficulty.length > 0 && (
            <Badge variant="secondary" className="gap-1 pr-1">
              난이도:{' '}
              {state.difficulty
                .map(
                  (d) =>
                    DIFFICULTY_OPTIONS.find((o) => o.value === d)?.label ?? d,
                )
                .join('/')}
              <button
                type="button"
                onClick={handleRemoveDifficulty}
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
          {state.themes.length > 0 && (
            <Badge variant="secondary" className="gap-1 pr-1">
              테마: {state.themes.join('/')}
              <button
                type="button"
                onClick={handleRemoveThemes}
                className="hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
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

        {/* Difficulty Checkboxes */}
        <div>
          <label className="text-xs text-muted-foreground">난이도</label>
          <div className="mt-1.5 flex flex-col gap-2">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`difficulty-${opt.value}`}
                  checked={state.difficulty.includes(opt.value)}
                  onCheckedChange={() => toggleDifficulty(opt.value)}
                />
                <Label
                  htmlFor={`difficulty-${opt.value}`}
                  className="text-sm font-normal cursor-pointer"
                >
                  {opt.label}
                </Label>
              </div>
            ))}
          </div>
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
                onClick={() => toggleDistance(key)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Theme Checkboxes */}
        {themes.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">테마</label>
            <div className="mt-1.5 flex flex-col gap-2">
              {themes.map((theme) => (
                <div key={theme} className="flex items-center gap-2">
                  <Checkbox
                    id={`theme-${theme}`}
                    checked={state.themes.includes(theme)}
                    onCheckedChange={() => toggleTheme(theme)}
                  />
                  <Label
                    htmlFor={`theme-${theme}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {theme}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apply Button */}
        <Button type="button" onClick={handleApply} className="w-full mt-1">
          필터 적용
        </Button>
      </div>
    </div>
  )
}
