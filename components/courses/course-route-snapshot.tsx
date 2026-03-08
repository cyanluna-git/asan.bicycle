'use client'

import {
  StaticMap,
  useKakaoLoader,
} from 'react-kakao-maps-sdk'
import {
  getRoutePreviewViewport,
  normalizeRoutePreviewPoints,
} from '@/lib/course-route-preview'
import { cn } from '@/lib/utils'
import type { RoutePreviewPoint } from '@/types/course'

interface CourseRouteSnapshotProps {
  points: RoutePreviewPoint[]
  className?: string
}

export function CourseRouteSnapshot({
  points,
  className,
}: CourseRouteSnapshotProps) {
  const normalizedPoints = normalizeRoutePreviewPoints(points)
  const routeLine = normalizedPoints.join(' ')
  const viewport = getRoutePreviewViewport(points)
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '',
  })
  const [startPoint, endPoint] =
    normalizedPoints.length > 1
      ? [normalizedPoints[0].split(','), normalizedPoints[normalizedPoints.length - 1].split(',')]
      : [null, null]
  const canRenderMap = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_KEY) && !loading && !error

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(248,248,246,0.98),_rgba(255,255,255,0.98))]',
        className,
      )}
    >
      {canRenderMap ? (
        <StaticMap
          center={viewport.center}
          level={viewport.level}
          marker={false}
          className="absolute inset-0 h-full w-full scale-[1.06] saturate-[0.9]"
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(239,242,245,0.96),_rgba(247,248,250,0.98))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_80%_35%,_rgba(34,197,94,0.12),_transparent_22%)]" />
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" fill="none">
            <g stroke="rgba(15,23,42,0.06)" strokeWidth="0.8">
              <path d="M6 20H94" />
              <path d="M6 50H94" />
              <path d="M6 80H94" />
              <path d="M18 6V94" />
              <path d="M44 6V94" />
              <path d="M70 6V94" />
            </g>
            <path
              d="M4 76C18 70 26 58 38 56C47 54 56 60 66 56C76 52 86 40 96 22"
              stroke="rgba(59,130,246,0.16)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M12 10C27 18 36 30 43 43C52 58 59 72 84 86"
              stroke="rgba(249,115,22,0.1)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeDasharray="3 4"
            />
          </svg>
        </>
      )}

      <div className="absolute inset-0 bg-white/18" />
      <div className="absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,_rgba(255,255,255,0.4),_transparent)]" />

      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="relative h-full w-full"
        fill="none"
      >
        {normalizedPoints.length > 1 && startPoint && endPoint ? (
          <>
            <polyline
              points={routeLine}
              stroke="rgba(255,255,255,0.96)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={routeLine}
              stroke="rgba(252,76,2,0.28)"
              strokeWidth="6.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={routeLine}
              stroke="#fc4c02"
              strokeWidth="3.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={startPoint[0]}
              cy={startPoint[1]}
              r="4.8"
              fill="rgba(255,255,255,0.95)"
            />
            <circle
              cx={startPoint[0]}
              cy={startPoint[1]}
              r="2.7"
              fill="#fc4c02"
            />
            <circle
              cx={endPoint[0]}
              cy={endPoint[1]}
              r="4.8"
              fill="rgba(255,255,255,0.95)"
            />
            <circle
              cx={endPoint[0]}
              cy={endPoint[1]}
              r="2.7"
              fill="#2563eb"
            />
          </>
        ) : (
          <text
            x="50"
            y="52"
            textAnchor="middle"
            className="fill-muted-foreground text-[7px]"
          >
            route preview
          </text>
        )}
      </svg>
    </div>
  )
}
