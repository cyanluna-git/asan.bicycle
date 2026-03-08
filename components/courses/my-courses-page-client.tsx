'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, LogIn, MapPinned, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/lib/auth'
import { difficultyLabel, difficultyVariant } from '@/lib/difficulty'
import { supabase } from '@/lib/supabase'
import type { CourseListItem } from '@/types/course'
import type { User } from '@supabase/supabase-js'

type MyCourseRow = CourseListItem & {
  created_at: string
}

const COURSE_FIELDS = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, uploader_name, uploader_emoji, created_by, created_at'
const COURSE_FIELDS_FALLBACK = 'id, title, difficulty, distance_km, elevation_gain_m, theme, tags, created_by, created_at'

export function MyCoursesPageClient() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [courses, setCourses] = useState<MyCourseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }).catch(() => {
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) {
      setCourses([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const loadCourses = async () => {
      let data: MyCourseRow[] | null = null
      let error: { message: string } | null = null

      const query = await supabase
        .from('courses')
        .select(COURSE_FIELDS)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })

      data = (query.data as MyCourseRow[] | null) ?? null
      error = query.error ? { message: query.error.message } : null

      if (error && /(uploader_name|uploader_emoji)/i.test(error.message)) {
        const fallback = await supabase
          .from('courses')
          .select(COURSE_FIELDS_FALLBACK)
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
        data = (fallback.data as MyCourseRow[] | null) ?? null
        error = fallback.error ? { message: fallback.error.message } : null
      }

      if (cancelled) return

      if (error) {
        setError('내 코스 목록을 불러오지 못했습니다.')
        setLoading(false)
        return
      }

      setCourses(((data ?? []) as MyCourseRow[]).map((course) => ({
        ...course,
        uploader_name: course.uploader_name ?? null,
        uploader_emoji: course.uploader_emoji ?? null,
      })))
      setLoading(false)
    }

    void loadCourses()

    return () => {
      cancelled = true
    }
  }, [user])

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 pt-16 text-center">
        <MapPinned className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">내 코스</h1>
        <p className="text-sm text-muted-foreground">
          내가 등록한 코스를 보거나 수정하려면 로그인이 필요합니다.
        </p>
        <Button
          onClick={async () => {
            await signInWithGoogle()
          }}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Google로 로그인
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-24">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">내 코스</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            내가 등록한 코스를 확인하고 바로 수정할 수 있습니다.
          </p>
        </div>
        <Badge variant="outline">{courses.length}개</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
          {error}
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-16 text-center">
          <p className="text-sm font-medium">아직 등록한 코스가 없습니다.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            새 GPX 코스를 업로드하면 여기에서 다시 수정할 수 있습니다.
          </p>
          <Button asChild className="mt-4">
            <Link href="/upload">코스 업로드</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => (
            <article key={course.id} className="rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{course.title}</h2>
                  {course.uploader_name && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden>{course.uploader_emoji ?? '🙂'}</span>
                      <span>{course.uploader_name}</span>
                    </div>
                  )}
                </div>
                <Badge variant={difficultyVariant[course.difficulty]}>
                  {difficultyLabel[course.difficulty]}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>거리 {course.distance_km} km</span>
                <span>획득고도 {course.elevation_gain_m} m</span>
                {course.theme && <Badge variant="outline">{course.theme}</Badge>}
              </div>

              {course.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {course.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/explore?courseId=${course.id}&returnTo=${encodeURIComponent('/my-courses')}`}>상세 보기</Link>
                </Button>
                <Button asChild className="flex-1">
                  <Link href={`/courses/${course.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    수정
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
