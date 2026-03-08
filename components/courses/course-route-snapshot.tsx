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
  const normalized = normalizeRoutePreviewPoints(points)
  const hasRoute = normalized.length >= 2

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(248,248,246,0.98),_rgba(255,255,255,0.98))]',
        className,
      )}
    >
      {hasRoute ? (
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          {/* White outline for contrast */}
          <polyline
            points={normalized.join(' ')}
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeOpacity="0.98"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Orange route */}
          <polyline
            points={normalized.join(' ')}
            stroke="#FC4C02"
            strokeWidth="3"
            strokeOpacity="0.98"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Start marker */}
          <circle
            cx={normalized[0].split(',')[0]}
            cy={normalized[0].split(',')[1]}
            r="3.5"
            fill="#FC4C02"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
          {/* End marker */}
          <circle
            cx={normalized[normalized.length - 1].split(',')[0]}
            cy={normalized[normalized.length - 1].split(',')[1]}
            r="3.5"
            fill="#2563EB"
            stroke="#FFFFFF"
            strokeWidth="2"
          />
        </svg>
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
          <div className="absolute inset-0 bg-white/18" />
        </>
      )}
    </div>
  )
}
