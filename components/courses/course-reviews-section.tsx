'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Loader2,
  LogIn,
  MessageSquarePlus,
  Pencil,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { signInWithGoogle } from '@/lib/auth'
import { getReviewEmptyStateCopy, type ReviewSurfaceViewerState } from '@/lib/course-reviews-surface-ui'
import { supabase } from '@/lib/supabase'
import { sortCourseReviews, type ReviewSortOrder } from '@/lib/course-reviews-ui'
import { summarizeText } from '@/lib/text'
import type { CourseReview, CourseReviewStats } from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface CourseReviewsSectionProps {
  courseId: string
  reviews: CourseReview[]
  stats: CourseReviewStats | null
  viewerState: ReviewSurfaceViewerState
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: '체감 초급' },
  { value: 'moderate', label: '체감 중급' },
  { value: 'hard', label: '체감 고급' },
] as const

function formatDate(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-500" aria-label={`별점 ${rating}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={`h-3.5 w-3.5 ${index < rating ? 'fill-current' : ''}`}
        />
      ))}
    </div>
  )
}

export function CourseReviewsSection({
  courseId,
  reviews,
  stats,
  viewerState,
}: CourseReviewsSectionProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [sortOrder, setSortOrder] = useState<ReviewSortOrder>('latest')
  const [content, setContent] = useState('')
  const [riddenAt, setRiddenAt] = useState('')
  const [rating, setRating] = useState(5)
  const [perceivedDifficulty, setPerceivedDifficulty] = useState<'easy' | 'moderate' | 'hard'>('moderate')
  const [conditionNote, setConditionNote] = useState('')
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const composerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    }).catch(() => {})

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const ownReview = useMemo(
    () => (user ? reviews.find((review) => review.user_id === user.id) ?? null : null),
    [reviews, user],
  )
  const hasOwnReview = Boolean(ownReview)
  const sortedReviews = useMemo(
    () => sortCourseReviews(reviews, sortOrder),
    [reviews, sortOrder],
  )

  useEffect(() => {
    if (!ownReview) {
      setEditingReviewId(null)
      return
    }

    if (editingReviewId === ownReview.id) {
      setIsComposerOpen(true)
      setContent(ownReview.content)
      setRiddenAt(ownReview.ridden_at ?? '')
      setRating(ownReview.rating)
      setPerceivedDifficulty(ownReview.perceived_difficulty ?? 'moderate')
      setConditionNote(ownReview.condition_note ?? '')
    }
  }, [editingReviewId, ownReview])

  useEffect(() => {
    if (!isComposerOpen || !composerRef.current) {
      return
    }

    window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }, [isComposerOpen])

  const resetForm = () => {
    setContent('')
    setRiddenAt('')
    setRating(5)
    setPerceivedDifficulty('moderate')
    setConditionNote('')
  }

  const startEditOwnReview = () => {
    if (!ownReview) return

    setEditingReviewId(ownReview.id)
    setIsComposerOpen(true)
    setSubmitError(null)
    setSubmitSuccess(null)
    setContent(ownReview.content)
    setRiddenAt(ownReview.ridden_at ?? '')
    setRating(ownReview.rating)
    setPerceivedDifficulty(ownReview.perceived_difficulty ?? 'moderate')
    setConditionNote(ownReview.condition_note ?? '')
  }

  const cancelEdit = () => {
    setEditingReviewId(null)
    setIsComposerOpen(false)
    setSubmitError(null)
    setSubmitSuccess(null)
    resetForm()
  }

  const openCreateComposer = () => {
    if (!user || hasOwnReview) return

    setEditingReviewId(null)
    setSubmitError(null)
    setSubmitSuccess(null)
    resetForm()
    setIsComposerOpen(true)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(null)

    if (!user) {
      setSubmitError('로그인 후 후기를 남길 수 있습니다.')
      return
    }

    if (hasOwnReview && editingReviewId !== ownReview?.id) {
      setSubmitError('후기는 1개만 작성할 수 있습니다. 기존 후기를 수정하거나 삭제해주세요.')
      return
    }

    if (!content.trim()) {
      setSubmitError('후기 본문을 입력해주세요.')
      return
    }

    startSubmitTransition(() => {
      void (async () => {
        const payload = {
          rating,
          content: content.trim(),
          ridden_at: riddenAt || null,
          perceived_difficulty: perceivedDifficulty,
          condition_note: conditionNote.trim() || null,
        }
        const response = editingReviewId
          ? await supabase
              .from('course_reviews')
              .update(payload)
              .eq('id', editingReviewId)
              .eq('user_id', user.id)
          : await supabase
              .from('course_reviews')
              .insert({
                course_id: courseId,
                user_id: user.id,
                ...payload,
              })

        if (response.error) {
          setSubmitError(response.error.message)
          return
        }

        setSubmitSuccess(editingReviewId ? '후기가 수정되었습니다.' : '후기가 등록되었습니다.')
        setIsComposerOpen(false)
        setEditingReviewId(null)
        resetForm()
        router.refresh()
      })()
    })
  }

  const handleDelete = () => {
    if (!ownReview || !user) return

    setSubmitError(null)
    setSubmitSuccess(null)

    startDeleteTransition(() => {
      void (async () => {
        const { error } = await supabase
          .from('course_reviews')
          .update({
            deleted_at: new Date().toISOString(),
          })
          .eq('id', ownReview.id)
          .eq('user_id', user.id)

        if (error) {
          setSubmitError(error.message)
          return
        }

        setEditingReviewId(null)
        setIsComposerOpen(false)
        resetForm()
        setSubmitSuccess('후기가 삭제되었습니다.')
        router.refresh()
      })()
    })
  }

  const showComposer = Boolean(
    user && isComposerOpen && (!hasOwnReview || editingReviewId === ownReview?.id),
  )

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Feed Summary
          </h3>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {stats?.review_count
              ? `${stats.review_count}개 후기 · 평균 ${stats.avg_rating?.toFixed(1) ?? '-'}점`
              : '아직 등록된 후기가 없습니다.'}
          </p>
        </div>
        <div className="relative w-32">
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            aria-label="후기 정렬"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as ReviewSortOrder)}
            className="h-10 w-full appearance-none rounded-full border bg-background px-4 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      </div>

      {submitSuccess && !showComposer && (
        <div
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          aria-live="polite"
        >
          {submitSuccess}
        </div>
      )}

      {!user ? (
        <div className="rounded-[24px] border bg-[linear-gradient(180deg,_rgba(248,244,236,0.95),_rgba(255,255,255,0.98))] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Write a Review
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                직접 탄 느낌을 남기려면 로그인이 필요합니다.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                라이딩한 날짜, 체감 난이도, 노면 상태를 남기면 다음 라이더가 코스를 더 잘 판단할 수 있습니다.
              </p>
            </div>
            <Button
              onClick={async () => {
                await signInWithGoogle()
              }}
              className="shrink-0 rounded-full"
            >
              <LogIn className="mr-2 h-4 w-4" />
              로그인
            </Button>
          </div>
        </div>
      ) : hasOwnReview && !showComposer ? (
        <div className="rounded-[24px] border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  My Review
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startEditOwnReview}
                  className="rounded-full"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  수정
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-full"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  삭제
                </Button>
              </div>
            </div>
            <div className="w-full space-y-2">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {summarizeText(ownReview?.content ?? '', 180) ?? '내 후기를 수정하거나 삭제할 수 있습니다.'}
              </p>
            </div>
          </div>
        </div>
      ) : !hasOwnReview && !showComposer ? (
        <div className="rounded-[24px] border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Write a Review
              </div>
              <p className="mt-2 text-sm font-semibold text-foreground">
                직접 탄 느낌을 한 줄로 남겨보세요.
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                후기 작성은 feed를 가리지 않는 composer 카드에서 진행됩니다.
              </p>
            </div>
            <Button
              type="button"
              onClick={openCreateComposer}
              className="shrink-0 rounded-full"
            >
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              후기 남기기
            </Button>
          </div>
        </div>
      ) : null}

      {showComposer && (
        <div
          ref={composerRef}
          className="rounded-[24px] border bg-card p-4 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">
              {editingReviewId ? '후기 수정' : '후기 남기기'}
            </h4>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <Label>별점</Label>
              <div className="mt-2 flex gap-2">
                {Array.from({ length: 5 }).map((_, index) => {
                  const nextRating = index + 1
                  return (
                    <button
                      key={nextRating}
                      type="button"
                      onClick={() => setRating(nextRating)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        rating === nextRating
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {nextRating}점
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="review-content">후기 본문</Label>
              <textarea
                id="review-content"
                rows={4}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="코스 분위기, 실제 난이도, 주의할 점 등을 남겨주세요."
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="review-ridden-at">라이딩 날짜</Label>
                <input
                  id="review-ridden-at"
                  type="date"
                  value={riddenAt}
                  onChange={(event) => setRiddenAt(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div>
                <Label htmlFor="review-difficulty">체감 난이도</Label>
                <select
                  id="review-difficulty"
                  value={perceivedDifficulty}
                  onChange={(event) => setPerceivedDifficulty(event.target.value as 'easy' | 'moderate' | 'hard')}
                  className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DIFFICULTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="review-condition-note">노면/위험구간 메모</Label>
              <textarea
                id="review-condition-note"
                rows={2}
                value={conditionNote}
                onChange={(event) => setConditionNote(event.target.value)}
                placeholder="공사 구간, 배수로, 자갈길 같은 실전 정보를 남겨주세요."
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            {submitSuccess && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {submitSuccess}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={cancelEdit}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !content.trim()}
                className="flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingReviewId ? '수정 중...' : '등록 중...'}
                  </>
                ) : editingReviewId ? '후기 수정' : '후기 등록'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {sortedReviews.length > 0 ? (
        <div className="space-y-3">
          {sortedReviews.map((review) => (
            <article
              key={review.id}
              className="rounded-[26px] border bg-card/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,_rgba(252,238,211,0.95),_rgba(244,213,160,0.85))] text-lg shadow-sm">
                      <span aria-hidden>{review.author_emoji ?? '🙂'}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {review.author_name ?? '라이더'}
                      </div>
                      {user?.id === review.user_id ? (
                        <div className="mt-1 inline-flex rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white">
                          내 후기
                        </div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {formatDate(review.created_at) && (
                          <MetaChip icon={<CalendarDays className="h-3 w-3" />}>
                            {formatDate(review.created_at)}
                          </MetaChip>
                        )}
                        {review.ridden_at && (
                          <MetaChip>라이딩 {formatDate(review.ridden_at)}</MetaChip>
                        )}
                        {review.perceived_difficulty && (
                          <MetaChip>
                            {DIFFICULTY_OPTIONS.find((option) => option.value === review.perceived_difficulty)?.label}
                          </MetaChip>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1">
                  <div className="flex items-center gap-1">
                    <RatingStars rating={review.rating} />
                    <span className="text-xs font-semibold text-amber-700">
                      {review.rating}.0
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-4 text-[15px] leading-7 text-foreground">
                {review.content}
              </p>

              {review.condition_note && (
                <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-3 py-3 text-sm text-foreground/80">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-amber-800/80">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    노면 / 위험구간 메모
                  </div>
                  <p className="mt-2 leading-6 text-foreground/80">
                    {review.condition_note}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed bg-[linear-gradient(180deg,_rgba(249,246,239,0.8),_rgba(255,255,255,0.96))] px-5 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">
            아직 첫 라이더 후기가 없습니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {getReviewEmptyStateCopy(viewerState)}
          </p>
        </div>
      )}

    </section>
  )
}

function MetaChip({
  children,
  icon,
}: {
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
      {icon}
      {children}
    </span>
  )
}
