'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronDown, ChevronUp, Box } from 'lucide-react'
import { getElevationProfileFromMetadata, normalizeRouteRenderMetadata } from '@/lib/course-render-metadata'
import { buildRouteHoverProfile, findNearestRouteHoverPoint, type RouteHoverPoint } from '@/lib/elevation-hover-sync'
import { buildWindSegments, type WindSegment } from '@/lib/wind-analysis'
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Slider } from '@/components/ui/slider'
import type { RouteGeoJSON, ElevationPoint, RouteRenderMetadata, UphillSegment } from '@/types/course'

const ElevationChart = dynamic(
  () => import('@/components/courses/elevation-chart').then((m) => m.ElevationChart),
  { ssr: false },
)
const SlopeStripChart = dynamic(
  () => import('@/components/courses/slope-strip-chart').then((m) => m.SlopeStripChart),
  { ssr: false },
)
const WindStripChart = dynamic(
  () => import('@/components/courses/wind-strip-chart').then((m) => m.WindStripChart),
  { ssr: false },
)
const Route3DProfile = dynamic(
  () => import('@/components/courses/route-3d-profile').then((m) => m.Route3DProfile),
  { ssr: false },
)

interface ElevationPanelProps {
  routeGeoJSON: RouteGeoJSON | null | undefined
  routeRenderMetadata?: RouteRenderMetadata | null
  uphillSegments?: UphillSegment[]
  courseTitle?: string
  windDirection?: number | null
  windSpeed?: number | null
  windSegmentsOverride?: WindSegment[] | null
  onHoverPointChange?: (point: RouteHoverPoint | null) => void
}

export function ElevationPanel({
  routeGeoJSON,
  routeRenderMetadata,
  uphillSegments = [],
  courseTitle,
  windDirection,
  windSpeed,
  windSegmentsOverride,
  onHoverPointChange,
}: ElevationPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredDistanceKm, setHoveredDistanceKm] = useState<number | null>(null)
  const [open3D, setOpen3D] = useState(false)
  const [verticalExaggeration, setVerticalExaggeration] = useState(3)

  const normalizedMetadata = useMemo(
    () => normalizeRouteRenderMetadata(routeRenderMetadata),
    [routeRenderMetadata],
  )
  const hoverProfile = useMemo(
    () => normalizedMetadata?.hoverProfile ?? buildRouteHoverProfile(routeGeoJSON),
    [normalizedMetadata, routeGeoJSON],
  )
  const elevationProfile = useMemo<ElevationPoint[]>(
    () => normalizedMetadata
      ? getElevationProfileFromMetadata(normalizedMetadata)
      : hoverProfile.map(({ distanceKm, elevationM }) => ({ distanceKm, elevationM })),
    [hoverProfile, normalizedMetadata],
  )
  const windSegments = useMemo<WindSegment[]>(
    () => {
      if (windSegmentsOverride && windSegmentsOverride.length > 0) {
        return windSegmentsOverride
      }
      return (windDirection != null && windSpeed != null)
        ? buildWindSegments(routeGeoJSON, windDirection, windSpeed)
        : []
    },
    [routeGeoJSON, windDirection, windSpeed, windSegmentsOverride],
  )

  const hasElevation = useMemo(() => {
    if (!routeGeoJSON) return false
    for (const feature of routeGeoJSON.features) {
      if (feature.geometry?.type !== 'LineString') continue
      for (const coord of feature.geometry.coordinates) {
        if (coord.length >= 3 && typeof coord[2] === 'number') return true
      }
    }
    return false
  }, [routeGeoJSON])

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
        <div className="flex items-center gap-1">
          {hasElevation && (
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setOpen3D(true)
              }}
            >
              <Box className="h-3 w-3" />
              3D 프로필
            </button>
          )}
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Chart */}
      {!collapsed && (
        <div className="px-2 pb-2">
          <div className="mb-2">
            <SlopeStripChart
              profile={elevationProfile}
              persistedSegments={normalizedMetadata?.slopeSegments ?? []}
              hoveredDistanceKm={hoveredDistanceKm}
              onHoverDistanceChange={setHoveredDistanceKm}
            />
          </div>
          {windSegments.length > 0 && (
            <div className="mb-2">
              <WindStripChart
                segments={windSegments}
                hoveredDistanceKm={hoveredDistanceKm}
                onHoverDistanceChange={setHoveredDistanceKm}
              />
            </div>
          )}
          <ElevationChart
            data={elevationProfile}
            persistedSegments={normalizedMetadata?.slopeSegments ?? []}
            segments={uphillSegments}
            hoveredDistanceKm={hoveredDistanceKm}
            onHoverDistanceChange={setHoveredDistanceKm}
          />
        </div>
      )}

      {/* 3D Profile Drawer */}
      {hasElevation && routeGeoJSON && (
        <Drawer open={open3D} onOpenChange={setOpen3D}>
          <DrawerContent className="h-[80vh]">
            <DrawerHandle />
            <DrawerHeader className="flex-row items-center justify-between py-2">
              <DrawerTitle className="text-sm">3D 고도 프로필</DrawerTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  수직 배율 {verticalExaggeration}x
                </span>
                <Slider
                  className="w-28"
                  min={1}
                  max={10}
                  step={1}
                  value={[verticalExaggeration]}
                  onValueChange={(v) => setVerticalExaggeration(v[0])}
                />
              </div>
            </DrawerHeader>
            <div className="px-2 pb-2" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Route3DProfile
                routeGeoJSON={routeGeoJSON}
                verticalExaggeration={verticalExaggeration}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  )
}
