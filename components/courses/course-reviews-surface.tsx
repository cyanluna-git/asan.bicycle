'use client'

import { useEffect, useRef } from 'react'
import { CalendarDays, MessageCircle, Star, X } from 'lucide-react'
import { CourseReviewsSection } from '@/components/courses/course-reviews-section'
import { Button } from '@/components/ui/button'
import {
  getReviewSurfaceIntroCopy,
  type ReviewSurfaceViewerState,
} from '@/lib/course-reviews-surface-ui'
import { cn } from '@/lib/utils'
import type { CourseReview, CourseReviewStats } from '@/types/course'

interface CourseReviewsSurfaceProps {
  courseId: string
  courseTitle: string
  reviews: CourseReview[]
  stats: CourseReviewStats | null
  viewerState: ReviewSurfaceViewerState
  onClose?: () => void
  className?: string
}

export function CourseReviewsSurface({
  courseId,
  courseTitle,
  reviews,
  stats,
  viewerState,
  onClose,
  className,
}: CourseReviewsSurfaceProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const latestReviewDate = reviews[0]?.created_at
    ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(
        new Date(reviews[0].created_at),
      )
    : null
  const introCopy = getReviewSurfaceIntroCopy({
    viewerState,
    reviewCount: stats?.review_count ?? 0,
  })

  useEffect(() => {
    if (!onClose) {
      return
    }

    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })
  }, [courseId, onClose])

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2',
        className,
      )}
    >
      <div className="border-b bg-[linear-gradient(180deg,_rgba(248,244,236,0.95)_0%,_rgba(255,255,255,0.98)_100%)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Rider Feed
            </p>
            <h2
              id={`review-surface-title-${courseId}`}
              className="mt-1 truncate text-base font-semibold text-foreground"
            >
              {courseTitle}
            </h2>
            {introCopy ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {introCopy}
              </p>
            ) : null}
          </div>
          {onClose ? (
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 shrink-0 rounded-full bg-background/80 shadow-sm"
              onClick={onClose}
              aria-label="후기 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <HeaderStatCard
            icon={<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
            label="평균 별점"
            value={stats?.avg_rating?.toFixed(1) ?? '-'}
          />
          <HeaderStatCard
            icon={<MessageCircle className="h-3.5 w-3.5 text-foreground/70" />}
            label="후기 수"
            value={`${stats?.review_count ?? 0}개`}
          />
          <HeaderStatCard
            icon={<CalendarDays className="h-3.5 w-3.5 text-foreground/70" />}
            label="최근 업데이트"
            value={latestReviewDate ?? '-'}
          />
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        aria-labelledby={`review-surface-title-${courseId}`}
      >
        <CourseReviewsSection
          courseId={courseId}
          reviews={reviews}
          stats={stats}
          viewerState={viewerState}
        />
      </div>
    </div>
  )
}

function HeaderStatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/80 px-3 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}
