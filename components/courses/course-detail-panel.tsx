'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Download, Pencil, Quote, Star, X } from 'lucide-react'
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
  onOpenReviews?: () => void
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
  onOpenReviews,
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
  const previewReview = reviews[0] ?? null
  const compactDescription = summarizeText(course.description, 120)
  const reviewPreview = summarizeText(previewReview?.content ?? null, 92)

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
      <div
        className="relative overflow-hidden rounded-[28px] border px-4 py-4 shadow-sm"
        style={{
          background:
            'linear-gradient(160deg, rgba(249,246,239,0.98) 0%, rgba(245,238,224,0.96) 48%, rgba(236,228,209,0.9) 100%)',
        }}
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.9),_transparent_58%)]" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-background/80 shadow-sm backdrop-blur"
          onClick={handleClose}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="relative space-y-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={difficultyVariant[course.difficulty]}>
              {difficultyLabel[course.difficulty]}
            </Badge>
            {course.theme ? (
              <span className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                {course.theme}
              </span>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold leading-tight text-foreground">
              {course.title}
            </h2>
            {course.uploader_name && (
              <div className="flex items-center gap-1.5 text-xs text-foreground/65">
                <span aria-hidden>{course.uploader_emoji ?? '🙂'}</span>
                <span>{course.uploader_name}</span>
              </div>
            )}
          </div>

          {compactDescription ? (
            <p className="max-w-[26ch] text-sm leading-relaxed text-foreground/75">
              {compactDescription}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <SummaryMetric label="거리" value={`${course.distance_km} km`} />
            <SummaryMetric
              label="획득고도"
              value={`↑ ${course.elevation_gain_m} m`}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {durations.map(({ label, speed }) => (
              <DurationTile
                key={label}
                label={label}
                value={calcDuration(
                  course.distance_km,
                  course.elevation_gain_m,
                  speed,
                )}
              />
            ))}
          </div>

          {course.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {course.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-medium text-foreground/70 ring-1 ring-black/5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[24px] border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Quote className="h-3.5 w-3.5" />
              라이더 반응
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span>{reviewStats?.avg_rating?.toFixed(1) ?? '-'}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {reviewStats?.review_count ?? 0}개 후기
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onOpenReviews}
            disabled={!onOpenReviews}
            className="shrink-0 rounded-full"
          >
            후기 보기
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>

        {reviewPreview ? (
          <div className="mt-3 rounded-2xl bg-muted/45 px-3 py-3">
            <p className="text-sm leading-relaxed text-foreground">
              “{reviewPreview}”
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>{previewReview?.author_emoji ?? '🙂'}</span>
              <span>{previewReview?.author_name ?? '라이더'}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            아직 첫 후기 전입니다. 실제 라이딩 느낌과 노면 정보를 남겨보세요.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            들를만한 곳
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

      {uphillSegments.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            업힐 구간
          </h3>
          <div className="flex flex-col gap-1">
            {uphillSegments.map((seg) => (
              <div
                key={seg.id}
                className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {seg.name || '이름 없음'}
                </span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {seg.start_km}~{seg.end_km} km
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {canEditCourse ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/courses/${course.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              코스 수정
            </Link>
          </Button>
        ) : (
          <div className="hidden sm:block" />
        )}

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
    </div>
  )
}

function SummaryMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/75 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}

function DurationTile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-black/5 px-2.5 py-3 text-center">
      <p className="text-[11px] font-medium text-foreground/45">{label}</p>
      <p className="mt-1 text-xs font-semibold text-foreground">{value}</p>
    </div>
  )
}

function summarizeText(value: string | null | undefined, maxLength: number) {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
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
