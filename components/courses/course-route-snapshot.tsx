import { normalizeRoutePreviewPoints } from '@/lib/course-route-preview'
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
  const [startPoint, endPoint] =
    normalizedPoints.length > 1
      ? [normalizedPoints[0].split(','), normalizedPoints[normalizedPoints.length - 1].split(',')]
      : [null, null]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(249,246,239,0.98),_rgba(255,255,255,0.98))]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.92),_transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.05),_transparent_36%)]" />
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="relative h-full w-full"
        fill="none"
      >
        <rect x="4" y="4" width="92" height="92" rx="18" fill="rgba(255,255,255,0.42)" />
        <g stroke="rgba(15,23,42,0.06)" strokeWidth="0.7">
          <path d="M10 24H90" />
          <path d="M10 50H90" />
          <path d="M10 76H90" />
          <path d="M24 10V90" />
          <path d="M50 10V90" />
          <path d="M76 10V90" />
        </g>
        <path
          d="M8 80C18 74 30 54 44 57C56 60 60 77 73 70C82 65 88 50 94 42"
          stroke="rgba(15,23,42,0.08)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="2.5 4.5"
        />
        <path
          d="M13 17C29 22 31 40 39 46C49 53 63 45 70 31C76 20 83 17 89 20"
          stroke="rgba(59,130,246,0.08)"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeDasharray="3 5"
        />
        <path
          d="M17 90C28 79 45 78 54 65C63 52 66 42 78 39"
          stroke="rgba(15,23,42,0.06)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="2 5"
        />
        {normalizedPoints.length > 1 && startPoint && endPoint ? (
          <>
            <polyline
              points={routeLine}
              stroke="rgba(37,99,235,0.12)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={routeLine}
              stroke="#111827"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={startPoint[0]}
              cy={startPoint[1]}
              r="4.6"
              fill="rgba(249,115,22,0.14)"
            />
            <circle
              cx={startPoint[0]}
              cy={startPoint[1]}
              r="2.7"
              fill="#f97316"
            />
            <circle
              cx={endPoint[0]}
              cy={endPoint[1]}
              r="4.6"
              fill="rgba(37,99,235,0.14)"
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
