'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Trash2, MousePointer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ElevationPoint } from '@/types/course'
import type { UphillSegmentDraft } from '@/lib/uphill-detection'

const ElevationChart = dynamic(
  () =>
    import('@/components/courses/elevation-chart').then(
      (mod) => mod.ElevationChart,
    ),
  { ssr: false },
)

interface UphillEditorProps {
  profile: ElevationPoint[]
  segments: UphillSegmentDraft[]
  onChange: (segments: UphillSegmentDraft[]) => void
}

export function UphillEditor({ profile, segments, onChange }: UphillEditorProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [firstKm, setFirstKm] = useState<number | null>(null)

  const handleChartClick = useCallback(
    (distanceKm: number) => {
      if (!isAdding) return

      if (firstKm === null) {
        setFirstKm(distanceKm)
      } else {
        const startKm = Math.min(firstKm, distanceKm)
        const endKm = Math.max(firstKm, distanceKm)

        if (endKm - startKm >= 0.01) {
          onChange([
            ...segments,
            {
              start_km: Math.round(startKm * 100) / 100,
              end_km: Math.round(endKm * 100) / 100,
              name: `업힐 ${segments.length + 1}`,
            },
          ])
        }
        setFirstKm(null)
        setIsAdding(false)
      }
    },
    [isAdding, firstKm, segments, onChange],
  )

  const updateSegment = (
    index: number,
    field: keyof UphillSegmentDraft,
    value: string | number,
  ) => {
    const updated = segments.map((s, i) =>
      i === index ? { ...s, [field]: value } : s,
    )
    onChange(updated)
  }

  const deleteSegment = (index: number) => {
    onChange(segments.filter((_, i) => i !== index))
  }

  const statusMessage = isAdding
    ? firstKm === null
      ? '차트에서 시작점을 클릭하세요'
      : '차트에서 종료점을 클릭하세요'
    : null

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">업힐 구간</h3>

      {/* Chart */}
      <ElevationChart
        data={profile}
        segments={segments}
        onChartClick={isAdding ? handleChartClick : undefined}
        clickState={isAdding ? { firstKm } : undefined}
      />

      {/* Status message */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <MousePointer className="h-4 w-4 shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Segment list */}
      {segments.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground">
          탐지된 업힐 구간이 없습니다. 수동으로 추가할 수 있습니다.
        </p>
      )}

      {segments.length > 0 && (
        <div className="space-y-2">
          {segments.map((seg, i) => {
            const isInvalid = seg.start_km >= seg.end_km
            return (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg border p-2 ${
                  isInvalid ? 'border-red-300 bg-red-50' : 'border-muted'
                }`}
              >
                <input
                  type="text"
                  value={seg.name}
                  onChange={(e) => updateSegment(i, 'name', e.target.value)}
                  placeholder="구간 이름"
                  className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="number"
                  value={seg.start_km}
                  step={0.01}
                  onChange={(e) =>
                    updateSegment(i, 'start_km', parseFloat(e.target.value) || 0)
                  }
                  className="h-8 w-20 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="시작 km"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <input
                  type="number"
                  value={seg.end_km}
                  step={0.01}
                  onChange={(e) =>
                    updateSegment(i, 'end_km', parseFloat(e.target.value) || 0)
                  }
                  className="h-8 w-20 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="종료 km"
                />
                <span className="text-xs text-muted-foreground">km</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteSegment(i)}
                  aria-label="구간 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {isInvalid && (
                  <span className="text-xs text-red-600 whitespace-nowrap">
                    시작 &ge; 종료
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setIsAdding(!isAdding)
          setFirstKm(null)
        }}
      >
        {isAdding ? (
          '취소'
        ) : (
          <>
            <Plus className="mr-1 h-3.5 w-3.5" />
            구간 추가
          </>
        )}
      </Button>
    </div>
  )
}
