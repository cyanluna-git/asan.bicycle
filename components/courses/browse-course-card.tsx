import Image from 'next/image'
import Link from 'next/link'
import { MessageCircle, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CourseRouteSnapshot } from '@/components/courses/course-route-snapshot'
import { difficultyLabel, difficultyVariant } from '@/lib/difficulty'
import { cn } from '@/lib/utils'
import type { CourseBrowseItem } from '@/types/course'

interface BrowseCourseCardProps {
  course: CourseBrowseItem
  href: string
  isFocused?: boolean
  className?: string
}

export function BrowseCourseCard({
  course,
  href,
  isFocused = false,
  className,
}: BrowseCourseCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group block overflow-hidden rounded-[28px] border border-black/8 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-black/15 hover:shadow-lg',
        isFocused && 'border-foreground ring-2 ring-foreground/15 shadow-lg',
        className,
      )}
    >
      <div className="space-y-4 p-4">
        {course.preview_image_url ? (
          <div className="relative h-32 overflow-hidden rounded-[20px]">
            <Image
              src={course.preview_image_url}
              alt={`${course.title} 루트 미리보기`}
              fill
              className="object-contain"
              sizes="(max-width: 640px) 100vw, 400px"
            />
          </div>
        ) : (
          <CourseRouteSnapshot points={course.route_preview} className="h-32" />
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-foreground">
              {course.title}
            </h2>
            {course.uploader_name ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden>{course.uploader_emoji ?? '🙂'}</span>
                <span>{course.uploader_name}</span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge
              variant={difficultyVariant[course.difficulty]}
              className="rounded-full px-2.5 py-1"
            >
              {difficultyLabel[course.difficulty]}
            </Badge>
            <SurfaceTypeBadge type={course.surface_type} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="거리" value={`${course.distance_km} km`} />
          <MetricCard label="획득고도" value={`↑ ${course.elevation_gain_m} m`} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {course.theme ? (
            <span className="rounded-full border border-black/8 bg-[#f6f4ee] px-2.5 py-1 text-[11px] font-medium text-foreground/80">
              {course.theme}
            </span>
          ) : null}
          {course.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 rounded-[20px] border border-black/6 bg-[#fbfaf7] px-3 py-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
            <span>{course.avg_rating?.toFixed(1) ?? '-'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4" />
            <span>{course.review_count}개 후기</span>
          </div>
        </div>

        {course.review_preview ? (
          <div className="rounded-[22px] bg-[#f7f4ec] px-3 py-3">
            <p className="text-sm leading-relaxed text-foreground">
              “{course.review_preview}”
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>{course.review_author_emoji ?? '🙂'}</span>
              <span>{course.review_author_name ?? '라이더'}</span>
            </div>
          </div>
        ) : null}
      </div>
    </Link>
  )
}

const SURFACE_LABELS: Record<string, string> = {
  road: '로드',
  gravel: '그래블',
  mtb: '임도',
}

const SURFACE_CLASSES: Record<string, string> = {
  road: 'bg-blue-50 text-blue-700 border-blue-200',
  gravel: 'bg-amber-50 text-amber-700 border-amber-200',
  mtb: 'bg-green-50 text-green-700 border-green-200',
}

function SurfaceTypeBadge({ type }: { type: 'road' | 'gravel' | 'mtb' | null | undefined }) {
  if (!type || type === 'road') return null
  return (
    <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium', SURFACE_CLASSES[type])}>
      {SURFACE_LABELS[type]}
    </span>
  )
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-[18px] border border-black/6 bg-[#fcfbf7] px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
