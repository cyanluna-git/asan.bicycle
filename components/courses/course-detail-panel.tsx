'use client'

import Image from 'next/image'
import Link from 'next/link'
import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Camera, Download, ImagePlus, Loader2, LogIn, Pencil, Quote, Send, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/lib/auth'
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
import { resolveProfileEmoji } from '@/lib/profile'
import { summarizeText } from '@/lib/text'
import {
  getPreviewReviews,
  getReviewAuthorDisplay,
  shouldShowMoreButton,
} from '@/lib/review-preview'
import { uploadCourseAlbumPhoto } from '@/lib/course-album-upload'
import { supabase } from '@/lib/supabase'
import { getUploaderDisplayName } from '@/lib/user-display-name'
import type {
  CourseAlbumPhoto,
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface CourseDetailPanelProps {
  course: CourseDetail
  pois?: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
  uphillSegments?: UphillSegment[]
  canEditCourse?: boolean
  reviews?: CourseReview[]
  reviewStats?: CourseReviewStats | null
  albumPreviewPhotos?: CourseAlbumPhoto[]
  user?: User | null
  onOpenReviews?: (triggerEl?: HTMLButtonElement | null) => void
  reviewTriggerId?: string
  onOpenAlbum?: (triggerEl?: HTMLButtonElement | null) => void
  albumTriggerId?: string
  onAlbumPhotoUploaded?: (photo: CourseAlbumPhoto) => void
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
  albumPreviewPhotos = [],
  user = null,
  onOpenReviews,
  reviewTriggerId,
  onOpenAlbum,
  albumTriggerId,
  onAlbumPhotoUploaded,
}: CourseDetailPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [activeCategory, setActiveCategory] = useState<PoiCategoryFilter>('all')
  const [optimisticReview, setOptimisticReview] = useState<CourseReview | null>(null)

  const allReviews = optimisticReview
    ? [optimisticReview, ...reviews.filter((r) => r.id !== optimisticReview.id)]
    : reviews

  const hasOwnReview = Boolean(
    user && allReviews.some((r) => r.user_id === user.id),
  )

  const handleClose = () => {
    const returnTo = searchParams.get('returnTo')
    if (returnTo) {
      router.replace(returnTo, { scroll: false })
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    params.delete('courseId')
    params.delete('returnTo')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const durations = [
    { label: '초심자', speed: SPEED_BEGINNER },
    { label: '초중급', speed: SPEED_INTERMEDIATE },
    { label: '중상급', speed: SPEED_ADVANCED },
  ] as const
  const categoryTabs = getPoiCategoryTabs(pois)
  const visiblePois = sortPoisForRail(pois, activeCategory)
  const previewReviews = getPreviewReviews(allReviews)
  const compactDescription = summarizeText(course.description, 120)

  useEffect(() => {
    setActiveCategory('all')
    setOptimisticReview(null)
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
        <div className="relative space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant={difficultyVariant[course.difficulty]}>
                {difficultyLabel[course.difficulty]}
              </Badge>
              {course.theme ? (
                <span className="rounded-full border border-black/10 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
                  {course.theme}
                </span>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-full bg-background/88 px-3 shadow-sm backdrop-blur"
              onClick={handleClose}
              aria-label="돌아가기"
            >
              <ArrowLeft className="h-4 w-4" />
              돌아가기
            </Button>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold leading-tight text-foreground [word-break:keep-all]">
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
            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground/75">
              {compactDescription}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <SummaryMetric label="거리" value={`${course.distance_km} km`} />
            <SummaryMetric
              label="획득고도"
              value={`${course.elevation_gain_m.toLocaleString('ko-KR')}m`}
            />
          </div>

          <div className="flex flex-col gap-2">
            {durations.map(({ label, speed }) => (
              <DurationTile
                key={label}
                label={label}
                speed={`${speed} km/h`}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Quote className="h-3.5 w-3.5" />
              라이더 반응
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span>{reviewStats?.avg_rating?.toFixed(1) ?? '-'}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {reviewStats?.review_count ?? 0}개 후기
              </span>
            </div>
          </div>
          {shouldShowMoreButton(allReviews) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              id={reviewTriggerId}
              onClick={(event) => onOpenReviews?.(event.currentTarget)}
              disabled={!onOpenReviews}
              className="h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0"
              aria-haspopup="dialog"
              aria-label={`${course.title} 후기 더보기`}
            >
              더보기
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {previewReviews.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2.5">
            {previewReviews.map((review) => (
              <ReviewPreviewCard key={review.id} review={review} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            아직 첫 후기 전입니다.
          </p>
        )}

        {!user ? (
          <InlineLoginPrompt />
        ) : hasOwnReview ? (
          <InlineOwnReviewNotice
            onOpenReviews={onOpenReviews}
            reviewTriggerId={reviewTriggerId}
          />
        ) : (
          <InlineReviewForm
            courseId={course.id}
            user={user}
            onSubmitted={setOptimisticReview}
          />
        )}
      </div>

      <div className="rounded-[24px] border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              라이드 앨범
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            id={albumTriggerId}
            onClick={(event) => onOpenAlbum?.(event.currentTarget)}
            disabled={!onOpenAlbum}
            className="h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0"
            aria-haspopup="dialog"
            aria-label={`${course.title} 앨범 보기`}
          >
            앨범 보기
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>

        {albumPreviewPhotos.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-1.5">
            {albumPreviewPhotos.slice(0, 4).map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-black/5"
                onClick={() => onOpenAlbum?.()}
                aria-label="앨범 사진 보기"
              >
                <Image
                  src={photo.public_url}
                  alt={photo.caption || `${course.title} 라이딩 사진`}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 50vw, 120px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            아직 등록된 사진이 없습니다.
          </p>
        )}

        {!user ? (
          <InlineAlbumLoginPrompt />
        ) : (
          <InlineAlbumUploadButton
            courseId={course.id}
            onUploaded={onAlbumPhotoUploaded}
          />
        )}
      </div>

      <div className="rounded-[24px] border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            들를만한 곳
          </h3>
          <span className="text-xs text-muted-foreground">
            {pois.length}개
          </span>
        </div>

        {categoryTabs.length > 0 && (
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1.5 touch-pan-x">
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
          <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 touch-pan-x">
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

      <div className="rounded-[24px] border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              GPX 가져가기
            </h3>
            <p className="text-sm text-muted-foreground">
              모바일에서도 바로 다운로드 링크를 열 수 있게 아래에 고정 액션으로 배치했습니다.
            </p>
          </div>
          <div className={`grid w-full gap-2 sm:w-auto ${canEditCourse ? 'sm:grid-cols-2' : ''}`}>
            {canEditCourse ? (
              <Button asChild variant="outline" className="h-11 w-full">
                <Link href={`/courses/${course.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  코스 수정
                </Link>
              </Button>
            ) : null}

            {course.gpx_url ? (
              <Button asChild className="h-11 w-full">
                <a href={`/api/courses/${course.id}/download`}>
                  <Download className="mr-2 h-4 w-4" />
                  GPX 다운로드
                </a>
              </Button>
            ) : (
              <Button className="h-11 w-full" disabled>
                <Download className="mr-2 h-4 w-4" />
                GPX 다운로드
              </Button>
            )}
          </div>
        </div>
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
    <div className="rounded-2xl border border-black/5 bg-white/75 px-3.5 py-3 text-left">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">
        {label}
      </p>
      <p className="mt-1 whitespace-nowrap text-[1.15rem] font-semibold text-foreground sm:text-2xl">
        {value}
      </p>
    </div>
  )
}

function DurationTile({
  label,
  speed,
  value,
}: {
  label: string
  speed: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-black/5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground/45">{label}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{speed}</p>
        </div>
        <p className="shrink-0 whitespace-nowrap text-xl font-semibold text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function ReviewPreviewCard({ review }: { review: CourseReview }) {
  const excerpt = summarizeText(review.content, 92)
  const author = getReviewAuthorDisplay(review)
  return (
    <div className="rounded-2xl bg-muted/45 px-3.5 py-3.5">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < review.rating
                ? 'fill-amber-400 text-amber-400'
                : 'fill-muted text-muted'
            }`}
          />
        ))}
        <span className="ml-1 text-xs font-medium text-foreground/70">
          {review.rating.toFixed(1)}
        </span>
      </div>
      {excerpt && (
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
          {excerpt}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden>{author.emoji}</span>
        <span>{author.name}</span>
      </div>
    </div>
  )
}

function InlineLoginPrompt() {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-muted/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        후기를 남기려면 로그인하세요
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0"
        onClick={async () => {
          await signInWithGoogle()
        }}
      >
        <LogIn className="mr-1.5 h-3.5 w-3.5" />
        로그인
      </Button>
    </div>
  )
}

function InlineOwnReviewNotice({
  onOpenReviews,
  reviewTriggerId,
}: {
  onOpenReviews?: (triggerEl?: HTMLButtonElement | null) => void
  reviewTriggerId?: string
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-muted/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        이미 후기를 작성했습니다
      </span>
      {onOpenReviews && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          id={reviewTriggerId ? `${reviewTriggerId}-notice` : undefined}
          className="h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0"
          onClick={(event) => onOpenReviews(event.currentTarget)}
          aria-haspopup="dialog"
        >
          후기 보기
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function InlineReviewForm({
  courseId,
  user,
  onSubmitted,
}: {
  courseId: string
  user: User
  onSubmitted: (review: CourseReview | null) => void
}) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const displayRating = hoverRating || rating

  const handleSubmit = () => {
    setError(null)

    if (rating < 1 || rating > 5) {
      setError('별점을 선택해주세요 (1~5)')
      return
    }

    if (!content.trim()) {
      setError('한줄 후기를 입력해주세요.')
      return
    }

    const now = new Date().toISOString()
    const optimistic: CourseReview = {
      id: `optimistic-${Date.now()}`,
      course_id: courseId,
      user_id: user.id,
      rating,
      content: content.trim(),
      ridden_at: null,
      perceived_difficulty: null,
      condition_note: null,
      created_at: now,
      updated_at: now,
      author_name: getUploaderDisplayName(user),
      author_emoji: resolveProfileEmoji(user),
    }

    const submittedRating = rating
    const submittedContent = content.trim()

    onSubmitted(optimistic)
    setContent('')
    setRating(0)

    startTransition(() => {
      void (async () => {
        const { error: insertError } = await supabase
          .from('course_reviews')
          .insert({
            course_id: courseId,
            user_id: user.id,
            rating: submittedRating,
            content: submittedContent,
          })

        if (insertError) {
          onSubmitted(null)
          setError(insertError.message)
          setRating(submittedRating)
          setContent(submittedContent)
        }
      })()
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-2xl bg-muted/45 px-3 py-3">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <button
            key={i}
            type="button"
            className="rounded-full p-1"
            onMouseEnter={() => setHoverRating(i + 1)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(i + 1)}
            aria-label={`${i + 1}점`}
          >
            <Star
              className={`h-4 w-4 transition-colors ${
                i < displayRating
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-muted text-muted-foreground/40'
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-1 text-xs font-medium text-foreground/70">
            {rating}.0
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              handleSubmit()
            }
          }}
          placeholder="한줄 후기를 남겨주세요"
          className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20"
          disabled={isPending}
          maxLength={200}
        />
        <Button
          type="button"
          size="sm"
          className="h-10 rounded-xl sm:h-9 sm:shrink-0 sm:rounded-full"
          disabled={isPending || rating < 1 || !content.trim()}
          onClick={handleSubmit}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          등록
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

function InlineAlbumLoginPrompt() {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-muted/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        사진을 올리려면 로그인하세요
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0"
        onClick={async () => {
          await signInWithGoogle()
        }}
      >
        <LogIn className="mr-1.5 h-3.5 w-3.5" />
        로그인
      </Button>
    </div>
  )
}

function InlineAlbumUploadButton({
  courseId,
  onUploaded,
}: {
  courseId: string
  onUploaded?: (photo: CourseAlbumPhoto) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      // Reset input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''

      setIsUploading(true)
      setError(null)

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token || !session.user) {
          setError('로그인이 필요합니다.')
          return
        }

        const photo = await uploadCourseAlbumPhoto({
          courseId,
          accessToken: session.access_token,
          userId: session.user.id,
          file,
        })

        onUploaded?.(photo)
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : '사진 업로드에 실패했습니다.',
        )
      } finally {
        setIsUploading(false)
      }
    },
    [courseId, onUploaded],
  )

  return (
    <div className="mt-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="sr-only"
        disabled={isUploading}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full rounded-full"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
        )}
        사진 추가
      </Button>
      {error && (
        <p className="mt-1.5 text-xs text-destructive">{error}</p>
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
      className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors sm:px-3 sm:py-1 sm:text-xs ${
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
      className={`w-[17rem] shrink-0 snap-start overflow-hidden rounded-2xl border text-left transition-all sm:w-[216px] ${
        isSelected
          ? 'border-foreground bg-muted/50 shadow-md'
          : 'border-border bg-card hover:border-foreground/30 hover:bg-muted/30'
      }`}
    >
      <div className="relative h-32 w-full overflow-hidden bg-muted sm:h-28">
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
