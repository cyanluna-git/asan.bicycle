'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { RouteGeoJSON, ElevationPoint, UphillSegment } from '@/types/course'

const ElevationChart = dynamic(
  () => import('@/components/courses/elevation-chart').then((m) => m.ElevationChart),
  { ssr: false },
)

interface ElevationPanelProps {
  routeGeoJSON: RouteGeoJSON | null | undefined
  uphillSegments?: UphillSegment[]
  courseTitle?: string
}

export function ElevationPanel({ routeGeoJSON, uphillSegments = [], courseTitle }: ElevationPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const elevationProfile = useMemo<ElevationPoint[]>(() => {
    if (!routeGeoJSON) return []
    const points: ElevationPoint[] = []
    let cumKm = 0

    for (const feature of routeGeoJSON.features) {
      if (feature.geometry?.type !== 'LineString') continue
      const coords = feature.geometry.coordinates

      for (let i = 0; i < coords.length; i++) {
        const c = coords[i]
        if (c.length < 3 || c[2] == null) continue
        if (i > 0) {
          const p = coords[i - 1]
          const R = 6371
          const dLat = ((c[1] - p[1]) * Math.PI) / 180
          const dLng = ((c[0] - p[0]) * Math.PI) / 180
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((p[1] * Math.PI) / 180) *
              Math.cos((c[1] * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2
          cumKm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        }
        points.push({
          distanceKm: Math.round(cumKm * 100) / 100,
          elevationM: Math.round(c[2] * 10) / 10,
        })
      }
    }
    return points
  }, [routeGeoJSON])

  if (elevationProfile.length === 0) return null

  return (
    <div className="border-t bg-background shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      {/* Header bar */}
      <div
        className="flex h-8 cursor-pointer items-center justify-between px-4 hover:bg-muted/40 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="text-xs font-medium text-muted-foreground">
          고도 프로필{courseTitle ? ` — ${courseTitle}` : ''}
          {uphillSegments.length > 0 && (
            <span className="ml-2 text-orange-500">▲ {uphillSegments.length}개 업힐</span>
          )}
        </span>
        {collapsed ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Chart */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <ElevationChart data={elevationProfile} segments={uphillSegments} />
        </div>
      )}
    </div>
  )
}
