'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, MessageSquarePlus, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
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
  const [content, setContent] = useState('')
  const [riddenAt, setRiddenAt] = useState('')
  const [rating, setRating] = useState(5)
  const [perceivedDifficulty, setPerceivedDifficulty] = useState<'easy' | 'moderate' | 'hard'>('moderate')
  const [conditionNote, setConditionNote] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)
  const [isSubmitting, startSubmitTransition] = useTransition()

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

  const hasOwnReview = useMemo(
    () => Boolean(user && reviews.some((review) => review.user_id === user.id)),
    [reviews, user],
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(null)

    if (!user) {
      setSubmitError('로그인 후 후기를 남길 수 있습니다.')
      return
    }

    if (hasOwnReview) {
      setSubmitError('이미 이 코스에 후기를 남겼습니다. 수정/삭제는 다음 단계에서 지원됩니다.')
      return
    }

    if (!content.trim()) {
      setSubmitError('후기 본문을 입력해주세요.')
      return
    }

    startSubmitTransition(() => {
      void (async () => {
        const { error } = await supabase
          .from('course_reviews')
          .insert({
            course_id: courseId,
            user_id: user.id,
            rating,
            content: content.trim(),
            ridden_at: riddenAt || null,
            perceived_difficulty: perceivedDifficulty,
            condition_note: conditionNote.trim() || null,
          })

        if (error) {
          setSubmitError(error.message)
          return
        }

        setSubmitSuccess('후기가 등록되었습니다.')
        setContent('')
        setRiddenAt('')
        setRating(5)
        setPerceivedDifficulty('moderate')
        setConditionNote('')
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
      </div>

      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review) => (
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
        ) : hasOwnReview ? (
          <p className="mt-3 text-sm text-muted-foreground">
            이미 이 코스에 후기를 남겼습니다. 후기 수정/삭제는 다음 작업에서 지원됩니다.
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

            <Button type="submit" disabled={isSubmitting || !content.trim()} className="w-full">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  등록 중...
                </>
              ) : '후기 등록'}
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}
