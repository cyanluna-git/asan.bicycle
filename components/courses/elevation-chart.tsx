'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import type { ElevationPoint, UphillSegment } from '@/types/course'
import type { UphillSegmentDraft } from '@/lib/uphill-detection'

interface ElevationChartProps {
  data: ElevationPoint[]
  segments?: (UphillSegment | UphillSegmentDraft)[]
  onChartClick?: (distanceKm: number) => void
  clickState?: { firstKm: number | null }
}

export function ElevationChart({
  data,
  segments = [],
  onChartClick,
  clickState,
}: ElevationChartProps) {
  if (data.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (e: any) => {
    if (!onChartClick) return
    const label = e?.activeLabel
    if (label == null) return
    const km = typeof label === 'number' ? label : parseFloat(label)
    if (!isNaN(km)) onChartClick(km)
  }

  const minEle = Math.floor(Math.min(...data.map((d) => d.elevationM)) / 10) * 10
  const maxEle = Math.ceil(Math.max(...data.map((d) => d.elevationM)) / 10) * 10

  return (
    <div className="w-full" style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
          onClick={onChartClick ? handleClick : undefined}
          style={onChartClick ? { cursor: 'crosshair' } : undefined}
        >
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
            stroke="#3B82F6"
            fill="#93C5FD"
            fillOpacity={0.4}
            strokeWidth={1.5}
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
