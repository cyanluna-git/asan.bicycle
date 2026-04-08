'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { ElevationPoint, UphillSegment } from '@/types/course'
import type { RouteSlopeSegment } from '@/types/course'
import type { UphillSegmentDraft } from '@/lib/uphill-detection'
import {
  buildSlopeGradientStops,
  buildSlopeGradientStopsFromSegments,
  inflateSlopeDistanceSegments,
  getSlopeBandMeta,
} from '@/lib/slope-visualization'
import {
  ELEVATION_CHART_RIGHT_INSET,
  ELEVATION_CHART_Y_AXIS_WIDTH,
} from '@/lib/elevation-chart-layout'

function ElevationTooltip({
  active,
  payload,
  label,
  data,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: number
  data: ElevationPoint[]
}) {
  if (!active || !payload?.length || label == null) return null

  const elevationM = payload[0]?.value as number
  const distanceKm = Number(label)

  // Find index and compute gradient via centered finite difference
  const idx = data.findIndex((p) => p.distanceKm === distanceKm)
  let gradientPct: number | null = null
  if (idx > 0 && idx < data.length - 1) {
    const dEle = data[idx + 1].elevationM - data[idx - 1].elevationM
    const dKm = data[idx + 1].distanceKm - data[idx - 1].distanceKm
    if (dKm > 0) gradientPct = (dEle / (dKm * 1000)) * 100
  } else if (idx === 0 && data.length > 1) {
    const dEle = data[1].elevationM - data[0].elevationM
    const dKm = data[1].distanceKm - data[0].distanceKm
    if (dKm > 0) gradientPct = (dEle / (dKm * 1000)) * 100
  } else if (idx === data.length - 1 && data.length > 1) {
    const dEle = data[idx].elevationM - data[idx - 1].elevationM
    const dKm = data[idx].distanceKm - data[idx - 1].distanceKm
    if (dKm > 0) gradientPct = (dEle / (dKm * 1000)) * 100
  }

  const bandMeta = gradientPct !== null ? getSlopeBandMeta(gradientPct) : null

  return (
    <div className="rounded-lg border border-white/20 bg-gray-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="font-medium text-white/70">{distanceKm.toFixed(2)} km</p>
      <p className="mt-0.5 text-white">고도: {elevationM.toFixed(1)} m</p>
      {gradientPct !== null && bandMeta && (
        <p className="mt-0.5 font-semibold" style={{ color: bandMeta.color }}>
          경사도: {gradientPct >= 0 ? '+' : ''}{gradientPct.toFixed(1)}%
          <span className="ml-1 font-normal opacity-80">({bandMeta.label})</span>
        </p>
      )}
    </div>
  )
}

function UphillPeakLabel({
  viewBox,
  name,
}: {
  viewBox?: { x: number; y: number; height: number }
  name: string
}) {
  if (!viewBox || !name) return null
  const { x, y } = viewBox
  return (
    <text
      x={x}
      y={y + 11}
      fontSize={10}
      fill="#ef4444"
      textAnchor="middle"
      fontWeight={500}
    >
      {name}
    </text>
  )
}

interface ElevationChartProps {
  data: ElevationPoint[]
  persistedSegments?: RouteSlopeSegment[]
  segments?: (UphillSegment | UphillSegmentDraft)[]
  onChartClick?: (distanceKm: number) => void
  clickState?: { firstKm: number | null }
  onHoverDistanceChange?: (distanceKm: number | null) => void
  hoveredDistanceKm?: number | null
}

export function ElevationChart({
  data,
  persistedSegments = [],
  segments = [],
  onChartClick,
  clickState,
  onHoverDistanceChange,
  hoveredDistanceKm,
}: ElevationChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 })
  const hydratedSegments = useMemo(
    () => inflateSlopeDistanceSegments(persistedSegments),
    [persistedSegments],
  )
  const strokeGradientStops = useMemo(
    () => hydratedSegments.length > 0
      ? buildSlopeGradientStopsFromSegments(hydratedSegments, 1)
      : buildSlopeGradientStops(data, 1),
    [data, hydratedSegments],
  )
  const fillGradientStops = useMemo(
    () => hydratedSegments.length > 0
      ? buildSlopeGradientStopsFromSegments(hydratedSegments, 0.32)
      : buildSlopeGradientStops(data, 0.32),
    [data, hydratedSegments],
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (e: any) => {
    if (!onChartClick) return
    const label = e?.activeLabel
    if (label == null) return
    const km = typeof label === 'number' ? label : parseFloat(label)
    if (!isNaN(km)) onChartClick(km)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = (e: any) => {
    if (!onHoverDistanceChange) return
    const label = e?.activeLabel

    if (label == null) {
      onHoverDistanceChange(null)
      return
    }

    const km = typeof label === 'number' ? label : parseFloat(label)
    onHoverDistanceChange(Number.isNaN(km) ? null : km)
  }

  const minEle = Math.floor(Math.min(...data.map((d) => d.elevationM)) / 10) * 10
  const maxEle = Math.ceil(Math.max(...data.map((d) => d.elevationM)) / 10) * 10

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateSize = () => {
      const nextWidth = Math.max(0, Math.floor(node.clientWidth))
      const nextHeight = Math.max(0, Math.floor(node.clientHeight))
      setChartSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight },
      )
    }

    updateSize()

    const observer = new ResizeObserver(() => {
      updateSize()
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  if (data.length === 0) return null

  return (
    <div ref={containerRef} className="w-full min-w-0" style={{ height: 200, minWidth: 0 }}>
      {chartSize.width > 0 && chartSize.height > 0 ? (
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: ELEVATION_CHART_RIGHT_INSET, left: 0, bottom: 0 }}
            onClick={onChartClick ? handleClick : undefined}
            onMouseMove={onHoverDistanceChange ? handleMouseMove : undefined}
            onMouseLeave={onHoverDistanceChange ? () => onHoverDistanceChange(null) : undefined}
            style={onChartClick || onHoverDistanceChange ? { cursor: 'crosshair' } : undefined}
          >
            {strokeGradientStops.length > 0 ? (
              <defs>
                <linearGradient id={`${gradientId}-stroke`} x1="0%" y1="0%" x2="100%" y2="0%">
                  {strokeGradientStops.map((stop, index) => (
                    <stop
                      key={`stroke-${index}-${stop.offset}`}
                      offset={stop.offset}
                      stopColor={stop.color}
                      stopOpacity={stop.opacity ?? 1}
                    />
                  ))}
                </linearGradient>
                <linearGradient id={`${gradientId}-fill`} x1="0%" y1="0%" x2="100%" y2="0%">
                  {fillGradientStops.map((stop, index) => (
                    <stop
                      key={`fill-${index}-${stop.offset}`}
                      offset={stop.offset}
                      stopColor={stop.color}
                      stopOpacity={stop.opacity ?? 0.32}
                    />
                  ))}
                </linearGradient>
              </defs>
            ) : null}
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="distanceKm"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(v: number) => `${v.toFixed(1)}`}
              fontSize={11}
              label={{ value: 'km', position: 'insideBottomRight', offset: -5, fontSize: 11 }}
            />
            <YAxis
              domain={[minEle, maxEle]}
              tickFormatter={(v: number) => `${v}`}
              fontSize={11}
              width={ELEVATION_CHART_Y_AXIS_WIDTH}
              label={{ value: 'm', position: 'insideTopLeft', offset: 10, fontSize: 11 }}
            />
            <Tooltip
              content={(props) => (
                <ElevationTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as number}
                  data={data}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="elevationM"
              stroke={strokeGradientStops.length > 0 ? `url(#${gradientId}-stroke)` : '#3B82F6'}
              fill={fillGradientStops.length > 0 ? `url(#${gradientId}-fill)` : '#93C5FD'}
              fillOpacity={fillGradientStops.length > 0 ? 1 : 0.4}
              strokeWidth={1.8}
            />
            {segments.map((seg, i) => (
              <ReferenceArea
                key={`seg-${i}`}
                x1={seg.start_km}
                x2={seg.end_km}
                fill="#EF4444"
                fillOpacity={0.15}
                stroke="#EF4444"
                strokeOpacity={0.3}
              />
            ))}
            {segments.map((seg, i) => {
              const name = (seg as { name?: string | null }).name
              if (!name) return null
              return (
                <ReferenceLine
                  key={`uphill-peak-${i}`}
                  x={seg.end_km}
                  stroke="#ef4444"
                  strokeOpacity={0.4}
                  strokeDasharray="3 2"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  label={(props: any) => <UphillPeakLabel viewBox={props.viewBox} name={name} />}
                />
              )
            })}
            {hoveredDistanceKm != null ? (
              <ReferenceLine
                x={hoveredDistanceKm}
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            ) : null}
            {clickState?.firstKm !== null && clickState?.firstKm !== undefined && (
              <ReferenceArea
                x1={clickState.firstKm}
                x2={clickState.firstKm}
                stroke="#F59E0B"
                strokeWidth={2}
                strokeDasharray="4 2"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  )
}
