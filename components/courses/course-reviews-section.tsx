'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, MessageSquarePlus, Pencil, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { sortCourseReviews, type ReviewSortOrder } from '@/lib/course-reviews-ui'
import type { CourseReview, CourseReviewStats } from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface CourseReviewsSectionProps {
  courseId: string
  reviews: CourseReview[]
  stats: CourseReviewStats | null
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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

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
      setContent(ownReview.content)
      setRiddenAt(ownReview.ridden_at ?? '')
      setRating(ownReview.rating)
      setPerceivedDifficulty(ownReview.perceived_difficulty ?? 'moderate')
      setConditionNote(ownReview.condition_note ?? '')
    }
  }, [editingReviewId, ownReview])

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
    setSubmitError(null)
    setSubmitSuccess(null)
    resetForm()
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
      setSubmitError('이미 이 코스에 후기를 남겼습니다. 기존 후기를 수정하거나 삭제해주세요.')
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
        resetForm()
        setSubmitSuccess('후기가 삭제되었습니다.')
        router.refresh()
      })()
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">후기</h3>
          <p className="mt-1 text-sm text-foreground">
            {stats?.review_count
              ? `${stats.review_count}개 후기 · 평균 ${stats.avg_rating?.toFixed(1) ?? '-'}점`
              : '아직 등록된 후기가 없습니다.'}
          </p>
        </div>
        <div className="w-28">
          <select
            aria-label="후기 정렬"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as ReviewSortOrder)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
          </select>
        </div>
      </div>

      {sortedReviews.length > 0 ? (
        <div className="space-y-3">
          {sortedReviews.map((review) => (
            <article key={review.id} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span aria-hidden>{review.author_emoji ?? '🙂'}</span>
                    <span>{review.author_name ?? '라이더'}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {formatDate(review.created_at) && <span>{formatDate(review.created_at)}</span>}
                    {review.ridden_at && <span>라이딩 {formatDate(review.ridden_at)}</span>}
                    {review.perceived_difficulty && (
                      <span>
                        {DIFFICULTY_OPTIONS.find((option) => option.value === review.perceived_difficulty)?.label}
                      </span>
                    )}
                  </div>
                </div>
                <RatingStars rating={review.rating} />
              </div>

              <p className="mt-3 text-sm leading-relaxed">{review.content}</p>

              {review.condition_note && (
                <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  노면/위험구간 메모: {review.condition_note}
                </div>
              )}

              {user?.id === review.user_id && (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startEditOwnReview}
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
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    삭제
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
          아직 등록된 후기가 없습니다.
        </div>
      )}

      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">후기 남기기</h4>
        </div>

        {!user ? (
          <p className="mt-3 text-sm text-muted-foreground">
            로그인한 사용자만 후기를 작성할 수 있습니다. 지금은 후기 목록만 볼 수 있습니다.
          </p>
        ) : hasOwnReview && editingReviewId !== ownReview?.id ? (
          <p className="mt-3 text-sm text-muted-foreground">
            이미 이 코스에 후기를 남겼습니다. 아래 목록에서 수정하거나 삭제할 수 있습니다.
          </p>
        ) : (
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
              {editingReviewId && (
                <Button type="button" variant="outline" onClick={cancelEdit} className="flex-1">
                  취소
                </Button>
              )}
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
        )}
      </div>
    </section>
  )
}
