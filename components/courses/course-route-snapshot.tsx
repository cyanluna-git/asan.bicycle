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

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(249,246,239,0.98),_rgba(255,255,255,0.98))]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.92),_transparent_72%)]" />
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="relative h-full w-full"
        fill="none"
      >
        <path
          d="M6 80C21 68 32 40 47 44C62 48 62 73 79 66C88 63 92 50 96 43"
          stroke="rgba(24,24,27,0.08)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2.5 4"
        />
        {normalizedPoints.length > 1 ? (
          <>
            <polyline
              points={normalizedPoints.join(' ')}
              stroke="#111827"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={normalizedPoints[0].split(',')[0]} cy={normalizedPoints[0].split(',')[1]} r="2.7" fill="#f97316" />
            <circle
              cx={normalizedPoints[normalizedPoints.length - 1].split(',')[0]}
              cy={normalizedPoints[normalizedPoints.length - 1].split(',')[1]}
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
