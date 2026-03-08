import { Suspense } from 'react'
import { Search } from 'lucide-react'
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
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-[32px] border border-black/8 bg-[linear-gradient(160deg,_rgba(253,251,246,0.98)_0%,_rgba(247,242,231,0.98)_55%,_rgba(239,231,215,0.95)_100%)] px-5 py-6 shadow-sm md:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Course Feed
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                아산 출발 코스를 카드 앨범처럼 훑어보세요
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                코스명, 약식 경로 스냅샷, 거리, 고도, 라벨, 라이더 반응을 먼저 보고,
                마음에 드는 카드만 눌러 지도 상세로 들어갑니다.
              </p>
            </div>

            <form action="/courses" className="w-full max-w-xl">
              <div className="flex items-center gap-3 rounded-full border border-black/10 bg-white/90 px-4 py-2 shadow-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  type="search"
                  name="q"
                  defaultValue={searchQuery ?? ''}
                  placeholder="코스명, 설명, 테마로 검색"
                  className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {filters.startPoint ? <input type="hidden" name="startPoint" value={filters.startPoint} /> : null}
                {filters.difficulty.length > 0 ? (
                  <input type="hidden" name="difficulty" value={filters.difficulty.join(',')} />
                ) : null}
                {filters.distance ? <input type="hidden" name="distance" value={filters.distance} /> : null}
                {filters.themes.length > 0 ? (
                  <input type="hidden" name="theme" value={filters.themes.join(',')} />
                ) : null}
                <button
                  type="submit"
                  className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
                >
                  찾기
                </button>
              </div>
            </form>
          </div>
        </section>

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
