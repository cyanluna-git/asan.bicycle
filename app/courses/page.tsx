import { Suspense } from 'react'
import { BrowseCourseCard } from '@/components/courses/browse-course-card'
import { CourseFilter } from '@/components/filter/course-filter'
import { buildFilterQuery, countActiveFilters, parseFilterParams } from '@/lib/filter'
import { fetchBrowseCourses, getSearchQuery } from '@/lib/course-browse'
import { supabase } from '@/lib/supabase'

export default async function CoursesBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilterParams(params)
  const searchQuery = getSearchQuery(params)
  const focusCourseId = typeof params.focus === 'string' ? params.focus : null
  const filterQueryString = buildFilterQuery(filters)
  const baseQueryString = [filterQueryString, searchQuery ? `q=${encodeURIComponent(searchQuery)}` : '']
    .filter(Boolean)
    .join('&')

  const [courses, startPointsResult, themesResult] = await Promise.all([
    fetchBrowseCourses(params),
    supabase.from('start_points').select('id, name').order('name'),
    supabase.from('courses').select('theme').not('theme', 'is', null).order('theme'),
  ])

  const startPoints = (startPointsResult.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
  }))

  const themes = [
    ...new Set(
      (themesResult.data ?? [])
        .map((item) => item.theme)
        .filter((theme): theme is string => Boolean(theme && theme.length > 0)),
    ),
  ]

  const activeFilterCount = countActiveFilters(filters) + (searchQuery ? 1 : 0)

  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#f5f1e8]">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {courses.length}개 코스
            </p>
            <p className="text-xs text-muted-foreground">
              {activeFilterCount > 0 ? `${activeFilterCount}개 필터 적용 중` : '전체 코스 보기'}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-[28px] border border-black/8 bg-white/90 p-4 shadow-sm lg:hidden">
              <Suspense fallback={null}>
                <CourseFilter startPoints={startPoints} themes={themes} />
              </Suspense>
            </div>
            <div className="hidden rounded-[28px] border border-black/8 bg-white/90 p-4 shadow-sm lg:block">
              <Suspense fallback={null}>
                <CourseFilter startPoints={startPoints} themes={themes} />
              </Suspense>
            </div>
          </aside>

          <section>
            {courses.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-black/10 bg-white/80 px-6 py-16 text-center shadow-sm">
                <p className="text-base font-medium text-foreground">조건에 맞는 코스가 없습니다.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  검색어나 필터를 조정해서 다시 살펴보세요.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {courses.map((course) => {
                  const href = `/explore?courseId=${course.id}${baseQueryString ? `&${baseQueryString}` : ''}&returnTo=${encodeURIComponent(`/courses${baseQueryString ? `?${baseQueryString}` : ''}`)}`

                  return (
                    <BrowseCourseCard
                      key={course.id}
                      course={course}
                      href={href}
                      isFocused={focusCourseId === course.id}
                    />
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
