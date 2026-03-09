'use client'

import { useId, useMemo } from 'react'
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
import type { UphillSegmentDraft } from '@/lib/uphill-detection'
import { buildSlopeGradientStops } from '@/lib/slope-visualization'

interface ElevationChartProps {
  data: ElevationPoint[]
  segments?: (UphillSegment | UphillSegmentDraft)[]
  onChartClick?: (distanceKm: number) => void
  clickState?: { firstKm: number | null }
  onHoverDistanceChange?: (distanceKm: number | null) => void
  hoveredDistanceKm?: number | null
}

export function ElevationChart({
  data,
  segments = [],
  onChartClick,
  clickState,
  onHoverDistanceChange,
  hoveredDistanceKm,
}: ElevationChartProps) {
  const gradientId = useId().replace(/:/g, '')
  const strokeGradientStops = useMemo(
    () => buildSlopeGradientStops(data, 1),
    [data],
  )
  const fillGradientStops = useMemo(
    () => buildSlopeGradientStops(data, 0.32),
    [data],
  )
  if (data.length === 0) return null

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

  return (
    <div className="w-full" style={{ height: 200, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
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
            label={{ value: 'm', position: 'insideTopLeft', offset: 10, fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) => [`${value} m`, '고도']}
            labelFormatter={(label) => `${Number(label).toFixed(2)} km`}
          />
          <Area
            type="monotone"
            dataKey="elevationM"
            stroke={strokeGradientStops.length > 0 ? `url(#${gradientId}-stroke)` : '#3B82F6'}
            fill={fillGradientStops.length > 0 ? `url(#${gradientId}-fill)` : '#93C5FD'}
            fillOpacity={fillGradientStops.length > 0 ? 1 : 0.4}
            strokeWidth={1.8}
          />
          {/* Uphill segment highlights */}
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
          {hoveredDistanceKm != null ? (
            <ReferenceLine
              x={hoveredDistanceKm}
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          ) : null}
          {/* Pending first click marker */}
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
    </div>
  )
}
