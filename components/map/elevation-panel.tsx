'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { buildRouteHoverProfile, findNearestRouteHoverPoint, type RouteHoverPoint } from '@/lib/elevation-hover-sync'
import type { RouteGeoJSON, ElevationPoint, UphillSegment } from '@/types/course'

const ElevationChart = dynamic(
  () => import('@/components/courses/elevation-chart').then((m) => m.ElevationChart),
  { ssr: false },
)
const SlopeStripChart = dynamic(
  () => import('@/components/courses/slope-strip-chart').then((m) => m.SlopeStripChart),
  { ssr: false },
)

interface ElevationPanelProps {
  routeGeoJSON: RouteGeoJSON | null | undefined
  uphillSegments?: UphillSegment[]
  courseTitle?: string
  onHoverPointChange?: (point: RouteHoverPoint | null) => void
}

export function ElevationPanel({
  routeGeoJSON,
  uphillSegments = [],
  courseTitle,
  onHoverPointChange,
}: ElevationPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredDistanceKm, setHoveredDistanceKm] = useState<number | null>(null)

  const hoverProfile = useMemo(
    () => buildRouteHoverProfile(routeGeoJSON),
    [routeGeoJSON],
  )
  const elevationProfile = useMemo<ElevationPoint[]>(
    () => hoverProfile.map(({ distanceKm, elevationM }) => ({ distanceKm, elevationM })),
    [hoverProfile],
  )

  useEffect(() => {
    if (!onHoverPointChange || collapsed) {
      onHoverPointChange?.(null)
      return
    }

    onHoverPointChange(findNearestRouteHoverPoint(hoverProfile, hoveredDistanceKm))
  }, [collapsed, hoverProfile, hoveredDistanceKm, onHoverPointChange])

  useEffect(() => {
    setHoveredDistanceKm(null)
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
          <div className="mb-2">
            <SlopeStripChart
              profile={elevationProfile}
              hoveredDistanceKm={hoveredDistanceKm}
              onHoverDistanceChange={setHoveredDistanceKm}
            />
          </div>
          <ElevationChart
            data={elevationProfile}
            segments={uphillSegments}
            hoveredDistanceKm={hoveredDistanceKm}
            onHoverDistanceChange={setHoveredDistanceKm}
          />
        </div>
      )}
    </div>
  )
}
