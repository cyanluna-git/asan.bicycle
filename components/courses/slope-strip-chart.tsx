'use client'

import { useMemo, useRef } from 'react'
import type { ElevationPoint } from '@/types/course'
import { buildSlopeDistanceSegments } from '@/lib/slope-visualization'

interface SlopeStripChartProps {
  profile: ElevationPoint[]
  hoveredDistanceKm?: number | null
  onHoverDistanceChange?: (distanceKm: number | null) => void
}

export function SlopeStripChart({
  profile,
  hoveredDistanceKm,
  onHoverDistanceChange,
}: SlopeStripChartProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const segments = useMemo(() => buildSlopeDistanceSegments(profile), [profile])

  if (segments.length === 0) return null

  const startKm = segments[0].startKm
  const endKm = segments[segments.length - 1].endKm
  const totalKm = endKm - startKm

  if (totalKm <= 0) return null

  const markerOffsetPct = hoveredDistanceKm != null
    ? Math.min(100, Math.max(0, ((hoveredDistanceKm - startKm) / totalKm) * 100))
    : null

  const updateHoveredDistance = (clientX: number) => {
    if (!onHoverDistanceChange || !surfaceRef.current) return
    const rect = surfaceRef.current.getBoundingClientRect()
    if (rect.width <= 0) return

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onHoverDistanceChange(startKm + totalKm * ratio)
  }

  return (
    <div className="rounded-xl border bg-card/70 px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          경사도 스트립
        </span>
        <span className="text-[11px] text-muted-foreground">
          {endKm.toFixed(1)} km
        </span>
      </div>
      <div
        ref={surfaceRef}
        className="relative mt-2 h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-black/5"
        onMouseMove={(event) => updateHoveredDistance(event.clientX)}
        onMouseLeave={onHoverDistanceChange ? () => onHoverDistanceChange(null) : undefined}
        onPointerMove={(event) => updateHoveredDistance(event.clientX)}
      >
        {segments.map((segment, index) => (
          <div
            key={`${segment.startKm}-${segment.endKm}-${index}`}
            className="absolute inset-y-0"
            style={{
              left: `${((segment.startKm - startKm) / totalKm) * 100}%`,
              width: `${Math.max(1.2, ((segment.endKm - segment.startKm) / totalKm) * 100)}%`,
              backgroundColor: segment.color,
            }}
            aria-hidden
          />
        ))}
        {markerOffsetPct != null ? (
          <div
            className="absolute inset-y-[-2px] w-[2px] -translate-x-1/2 rounded-full bg-black/85 shadow-[0_0_0_2px_rgba(255,255,255,0.7)]"
            style={{ left: `${markerOffsetPct}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>시작</span>
        <span>도착</span>
      </div>
    </div>
  )
}
