import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Bike, Download, MapPinned, Mountain } from 'lucide-react'
import { createAnonServerClient } from '@/lib/supabase-server'
import { CourseRouteSnapshot } from '@/components/courses/course-route-snapshot'
import type { RoutePreviewPoint } from '@/types/course'

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

type RecentCourse = {
  id: string
  title: string
  difficulty: string | null
  distance_km: number
  elevation_gain_m: number
  theme: string | null
  tags: string[]
  route_preview_points: RoutePreviewPoint[] | null
}

async function fetchRecentCourses(): Promise<RecentCourse[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, difficulty, distance_km, elevation_gain_m, theme, tags, route_preview_points')
      .order('created_at', { ascending: false })
      .limit(3)

    if (error || !data) return []
    return data as RecentCourse[]
  } catch {
    return []
  }
}

export const revalidate = 300 // re-render every 5 minutes

// ---------------------------------------------------------------------------
// Static content
// ---------------------------------------------------------------------------

export const featureCards = [
  {
    icon: MapPinned,
    title: '내 지역에서 출발',
    body: '출발지 기준으로 가까운 코스를 바로 찾아 달리세요.',
  },
  {
    icon: Bike,
    title: 'Road / MTB',
    body: '스타일별로 빠르게 분기. 로드 루프와 임도 MTB 모두 커버.',
  },
  {
    icon: Download,
    title: '즉시 GPX 다운로드',
    body: '코스 파일을 단 한 번 탭으로. 사이클컴에 바로 넣으세요.',
  },
] as const

export const regionButtons = [
  '강원', '경기', '경상남도', '경상북도',
  '전라남도', '전라북도', '충청남도', '충청북도',
  '서울', '제주',
] as const


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  const courses = await fetchRecentCourses()

  return (
    <main className="min-h-[calc(100vh-64px)] overflow-hidden">

      {/* ------------------------------------------------------------------ */}
      {/* Hero Section — full-bleed photo with left-side overlay              */}
      {/* ------------------------------------------------------------------ */}
      <section className="relative min-h-[calc(100vh-64px)] overflow-hidden">

        {/* Background photo */}
        <div className="absolute inset-0">
          <Image
            src="/images/hero-cyclist.jpg"
            alt="산길을 달리는 라이더 — 석양 아래 구불구불한 산악 도로"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Gradient overlay: dark left for text legibility, transparent right to reveal photo */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to right, #0f2818 0%, #0f2818 28%, rgba(15,40,24,0.75) 50%, rgba(15,40,24,0.25) 75%, rgba(15,40,24,0.08) 100%)',
            }}
          />
        </div>

        {/* Content overlay */}
        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl items-center px-6 py-20 md:px-12 lg:px-20">
          <div className="max-w-2xl">

            {/* Headline block */}
            <div
              className="font-headline font-black leading-none"
              style={{ fontSize: 'clamp(72px, 11vw, 156px)' }}
            >
              <span className="text-white">Gul</span><span className="text-[#E8690A]">.rim</span>
            </div>
            <span className="mt-2 block text-xs font-semibold tracking-[0.4em] text-white/40 uppercase">
              ROAD &middot; MTB
            </span>

            {/* Korean tagline */}
            <h1 className="font-headline mt-6 text-4xl font-bold leading-snug text-white md:text-5xl">
              페달을 굴리고,
              <br />
              <span className="text-white/80">함께 어울리는 코스 커뮤니티</span>
            </h1>

            {/* CTA buttons */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-lg px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-black/20 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #994200 0%, #c05400 100%)' }}
              >
                코스 탐색하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                코스 올리기
              </Link>
            </div>

            {/* Feature pills */}
            <div className="mt-8 flex flex-wrap gap-2">
              {featureCards.map(({ icon: Icon, title }) => (
                <div
                  key={title}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-[#8FE36A]" />
                  {title}
                </div>
              ))}
            </div>
          </div>
        </div>


      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Features Section                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-stitch-surface px-6 py-16 md:px-12 lg:px-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-headline mb-12 text-center text-3xl font-bold text-stitch-on-surface md:text-4xl">
            라이딩을 더 쉽게
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {featureCards.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl bg-stitch-surface-container-low p-8 transition-colors hover:bg-stitch-surface-container-high"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <p className="text-lg font-semibold text-stitch-on-surface">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-stitch-on-surface-variant">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Map Preview Section                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-stitch-surface-container-low px-6 py-16 md:px-12 lg:px-20 lg:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:items-center">

          {/* Left — text + region buttons */}
          <div>
            <h2 className="font-headline mb-3 text-3xl font-bold text-stitch-on-surface md:text-4xl">
              내 동네 코스
              <br />
              바로 찾기
            </h2>
            <p className="mb-8 text-base text-stitch-on-surface-variant">
              지역을 선택하면 해당 지역의 추천 코스를 바로 볼 수 있어요.
            </p>
            <div className="flex flex-wrap gap-2">
              {regionButtons.map((region) => (
                <Link
                  key={region}
                  href="/explore"
                  className="rounded-full border border-stitch-outline/30 bg-stitch-surface px-4 py-1.5 text-sm font-medium text-stitch-on-surface-variant transition hover:bg-primary hover:text-white hover:border-primary"
                >
                  {region}
                </Link>
              ))}
            </div>
            <Link
              href="/explore"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              전체 지도로 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Right — Korea map with SVG silhouette */}
          <Link
            href="/explore"
            className="group relative overflow-hidden rounded-2xl block"
            style={{ aspectRatio: '4/3' }}
          >
            {/* Dark green base */}
            <div className="absolute inset-0 bg-[#0c1e12]" />
            {/* Korea map silhouette */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/maps/sido.svg"
              alt="한국 지역 지도"
              className="absolute inset-0 h-full w-full object-contain py-6 px-2"
              style={{ filter: 'brightness(0) invert(1)', opacity: 0.12 }}
            />
            {/* Radial green glow */}
            <div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(circle at 55% 50%, rgba(58,107,74,0.65) 0%, transparent 62%)' }}
            />
            {/* Hover reveal overlay */}
            <div className="absolute inset-0 bg-[#3a6b4a]/0 transition-colors duration-300 group-hover:bg-[#3a6b4a]/10" />
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-white/20 bg-black/35 px-6 py-4 text-center backdrop-blur-sm transition group-hover:border-white/30 group-hover:bg-black/45">
                <MapPinned className="mx-auto mb-2 h-8 w-8 text-[#8FE36A]" />
                <p className="text-sm font-semibold text-white">지역 선택 후 탐색</p>
                <p className="mt-1 text-xs text-white/60">카카오맵 기반 인터랙티브 지도</p>
              </div>
            </div>
          </Link>

        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Recommended Courses Section                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="bg-stitch-surface px-6 py-16 md:px-12 lg:px-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex items-center justify-between">
            <h2 className="font-headline text-3xl font-bold text-stitch-on-surface md:text-4xl">
              추천 인기 코스
            </h2>
            <Link
              href="/courses"
              className="text-sm font-semibold text-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.length > 0 ? courses.map((course) => (
              <article
                key={course.id}
                className="overflow-hidden rounded-2xl border border-stitch-outline/20 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Route map preview */}
                <div className="relative h-44">
                  <CourseRouteSnapshot
                    points={course.route_preview_points ?? []}
                    className="h-44 rounded-none"
                  />
                  <span className="absolute left-3 top-3 rounded-full border border-black/8 bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80 backdrop-blur-sm">
                    {(course.tags ?? []).includes('mtb') ? 'MTB' : 'Road'}
                  </span>
                </div>
                {/* Card body */}
                <div className="p-5">
                  <p className="font-semibold leading-snug text-stitch-on-surface line-clamp-2">
                    {course.title}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-stitch-on-surface-variant">
                    <span>{course.distance_km} km</span>
                    <span className="h-1 w-1 rounded-full bg-stitch-outline/40" />
                    <span>&uarr; {course.elevation_gain_m.toLocaleString()} m</span>
                    {course.theme && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-stitch-outline/40" />
                        <span>{course.theme}</span>
                      </>
                    )}
                  </div>
                  <Link
                    href={`/courses/${course.id}`}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    자세히 보기
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            )) : (
              // Fallback placeholder cards
              Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="overflow-hidden rounded-2xl border border-stitch-outline/20 bg-white shadow-sm opacity-70"
                >
                  <CourseRouteSnapshot points={[]} className="h-44 rounded-none" />
                  <div className="flex items-center justify-center py-6">
                    <p className="text-sm text-stitch-on-surface-variant">코스 준비 중</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* CTA Banner                                                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="px-6 py-16 md:px-12 lg:px-20 lg:py-24" style={{ background: 'linear-gradient(135deg, #994200 0%, #c05400 100%)' }}>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-headline text-3xl font-bold text-white md:text-5xl">
            지금 바로 첫 페달을 굴려보세요
          </h2>
          <p className="mt-4 text-base text-white/75">
            전국 자전거 코스가 기다립니다
          </p>
          <Link
            href="/explore"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-primary transition hover:bg-white/90"
          >
            시작하기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

    </main>
  )
}
