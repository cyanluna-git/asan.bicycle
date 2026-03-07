'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { X, Download, Pencil } from 'lucide-react'
import { CourseReviewsSection } from '@/components/courses/course-reviews-section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { difficultyLabel, difficultyVariant } from '@/lib/difficulty'
import {
  getPoiCategoryTabs,
  getPoiMeta,
  normalizePoiCategory,
  sortPoisForRail,
  type PoiCategoryFilter,
} from '@/lib/poi'
import {
  calcDuration,
  SPEED_BEGINNER,
  SPEED_INTERMEDIATE,
  SPEED_ADVANCED,
} from '@/lib/calc-duration'
import type {
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'

interface CourseDetailPanelProps {
  course: CourseDetail
  pois?: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
  uphillSegments?: UphillSegment[]
  canEditCourse?: boolean
  reviews?: CourseReview[]
  reviewStats?: CourseReviewStats | null
}

export function CourseDetailPanel({
  course,
  pois = [],
  selectedPoiId = null,
  onSelectPoi,
  uphillSegments = [],
  canEditCourse = false,
  reviews = [],
  reviewStats = null,
}: CourseDetailPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeCategory, setActiveCategory] = useState<PoiCategoryFilter>('all')

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('courseId')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }

  const durations = [
    { label: '초심자', speed: SPEED_BEGINNER },
    { label: '초중급', speed: SPEED_INTERMEDIATE },
    { label: '중상급', speed: SPEED_ADVANCED },
  ] as const
  const categoryTabs = getPoiCategoryTabs(pois)
  const visiblePois = sortPoisForRail(pois, activeCategory)

  useEffect(() => {
    setActiveCategory('all')
  }, [course.id])

  useEffect(() => {
    if (activeCategory !== 'all' && !categoryTabs.includes(activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, categoryTabs])

  useEffect(() => {
    if (selectedPoiId && !visiblePois.some((poi) => poi.id === selectedPoiId)) {
      onSelectPoi?.(null)
    }
  }, [onSelectPoi, selectedPoiId, visiblePois])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold leading-tight">
            {course.title}
          </h2>
          {course.uploader_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>{course.uploader_emoji ?? '🙂'}</span>
              <span>{course.uploader_name}</span>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -mr-2 -mt-1"
          onClick={handleClose}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Difficulty badge */}
      <div>
        <Badge variant={difficultyVariant[course.difficulty]}>
          {difficultyLabel[course.difficulty]}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>거리 {course.distance_km} km</span>
        <span>획득고도 &#8593; {course.elevation_gain_m} m</span>
      </div>

      {/* Duration section */}
      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          예상 소요시간
        </h3>
        <div className="flex flex-col gap-1.5">
          {durations.map(({ label, speed }) => (
            <div
              key={label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">
                {calcDuration(
                  course.distance_km,
                  course.elevation_gain_m,
                  speed,
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      {course.description && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">
            설명
          </h3>
          <p className="text-sm leading-relaxed">{course.description}</p>
        </div>
      )}

      {/* Theme & Tags */}
      {(course.theme || course.tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {course.theme && (
            <Badge variant="outline">{course.theme}</Badge>
          )}
          {course.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            들릴만한 곳
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {pois.length}개
          </span>
        </div>

        {categoryTabs.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <PoiFilterChip
              label="전체"
              isActive={activeCategory === 'all'}
              onClick={() => setActiveCategory('all')}
            />
            {categoryTabs.map((category) => (
              <PoiFilterChip
                key={category}
                label={getPoiMeta(category).label}
                isActive={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              />
            ))}
          </div>
        )}

        {visiblePois.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {visiblePois.map((poi) => (
              <PoiCard
                key={poi.id}
                poi={poi}
                isSelected={selectedPoiId === poi.id}
                onClick={() => onSelectPoi?.(poi.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
            등록된 POI가 없습니다.
          </div>
        )}
      </div>

      <CourseReviewsSection
        courseId={course.id}
        reviews={reviews}
        stats={reviewStats}
      />

      {/* Uphill segments list */}
      {uphillSegments.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            업힐 구간
          </h3>
          <div className="flex flex-col gap-1">
            {uphillSegments.map((seg) => (
              <div
                key={seg.id}
                className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-medium truncate">
                  {seg.name || '이름 없음'}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {seg.start_km}~{seg.end_km} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canEditCourse && (
        <Button asChild variant="outline" className="w-full">
          <Link href={`/courses/${course.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            코스 수정
          </Link>
        </Button>
      )}

      {/* GPX download */}
      {course.gpx_url ? (
        <Button asChild className="w-full">
          <a href={`/api/courses/${course.id}/download`}>
            <Download className="mr-2 h-4 w-4" />
            GPX 다운로드
          </a>
        </Button>
      ) : (
        <Button className="w-full" disabled>
          <Download className="mr-2 h-4 w-4" />
          GPX 다운로드
        </Button>
      )}
    </div>
  )
}

function PoiFilterChip({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        isActive
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {label}
    </button>
  )
}

function PoiCard({
  poi,
  isSelected,
  onClick,
}: {
  poi: PoiMapItem
  isSelected: boolean
  onClick: () => void
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const category = normalizePoiCategory(poi.category)
  const meta = getPoiMeta(category)
  const showImage = Boolean(poi.photo_url) && !imageFailed

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-[216px] shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-all ${
        isSelected
          ? 'border-foreground bg-muted/50 shadow-md'
          : 'border-border bg-card hover:border-foreground/30 hover:bg-muted/30'
      }`}
    >
      <div className="relative h-28 w-full overflow-hidden bg-muted">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poi.photo_url ?? ''}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-center"
            style={{
              background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}44)`,
            }}
          >
            <span className="text-2xl" aria-hidden>{meta.emoji}</span>
            <span className="text-xs font-medium text-foreground/80">
              {meta.label}
            </span>
          </div>
        )}
        <span
          className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold"
          style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-semibold text-foreground">
          {poi.name}
        </p>
        <p
          className="text-xs leading-5 text-muted-foreground"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {poi.description?.trim() || `${meta.label} 정보를 확인해보세요.`}
        </p>
      </div>
    </button>
  )
}
