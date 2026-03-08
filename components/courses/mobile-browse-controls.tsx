'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { CourseFilter } from '@/components/filter/course-filter'
import { countActiveFilters, parseFilterParams } from '@/lib/filter'

interface MobileBrowseControlsProps {
  courseCount: number
  startPoints: { id: string; name: string }[]
  themes: string[]
}

export function MobileBrowseControls({
  courseCount,
  startPoints,
  themes,
}: MobileBrowseControlsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const [draftSearch, setDraftSearch] = useState(searchParams.get('q') ?? '')

  const filters = useMemo(() => parseFilterParams(searchParams), [searchParams])
  const activeFilterCount = countActiveFilters(filters)
  const searchQuery = searchParams.get('q')?.trim() ?? ''
  const startPointName =
    startPoints.find((item) => item.id === filters.startPoint)?.name ?? null

  useEffect(() => {
    setDraftSearch(searchParams.get('q') ?? '')
  }, [searchParams])

  const summaryChips = [
    searchQuery ? `검색: ${searchQuery}` : null,
    startPointName,
    filters.difficulty.length > 0 ? `난이도 ${filters.difficulty.length}` : null,
    filters.distance ? '거리' : null,
    filters.themes.length > 0 ? `테마 ${filters.themes.length}` : null,
  ].filter(Boolean) as string[]

  const applySearch = () => {
    const params = new URLSearchParams(searchParams.toString())
    const normalized = draftSearch.trim()

    if (normalized) params.set('q', normalized)
    else params.delete('q')

    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    setOpen(false)
  }

  return (
    <div className="mb-4 lg:hidden">
      <div className="rounded-[28px] border border-black/8 bg-white/92 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{courseCount}개 코스</p>
            <p className="text-xs text-muted-foreground">
              {searchQuery || activeFilterCount > 0
                ? `${searchQuery ? '검색 적용' : ''}${searchQuery && activeFilterCount > 0 ? ' · ' : ''}${activeFilterCount > 0 ? `${activeFilterCount}개 필터 적용` : ''}`
                : '검색과 필터로 코스를 좁혀보세요'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 rounded-full border-black/10 px-4"
            onClick={() => setOpen(true)}
          >
            <Search className="h-4 w-4" />
            검색·필터
            {activeFilterCount > 0 ? (
              <Badge variant="default" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        </div>

        {summaryChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {summaryChips.map((chip) => (
              <Badge
                key={chip}
                variant="secondary"
                className="rounded-full border border-black/6 bg-[#f6f4ee] px-2.5 py-1 text-[11px] font-medium text-foreground/80"
              >
                {chip}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>검색과 필터</DrawerTitle>
            <DrawerDescription>
              코스명을 찾거나 필터를 조정해 피드를 빠르게 좁혀보세요.
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 pb-6">
            <div className="rounded-[24px] border border-black/8 bg-[#f8f6f0] p-3">
              <label className="mb-2 block text-xs font-medium text-muted-foreground">
                검색
              </label>
              <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 shadow-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="코스명, 설명, 테마 검색"
                  className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full px-4"
                  onClick={applySearch}
                >
                  적용
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-black/8 bg-[#f8f6f0] p-4">
              <div className="mb-3 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">필터</p>
              </div>
              <CourseFilter
                startPoints={startPoints}
                themes={themes}
                mode="drawer"
                showHeading={false}
                onApplied={() => setOpen(false)}
              />
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
