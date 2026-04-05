import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Bike, Download, MapPinned } from 'lucide-react'
import { createAnonServerClient } from '@/lib/supabase-server'

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
}

async function fetchRecentCourses(): Promise<RecentCourse[]> {
  try {
    const supabase = createAnonServerClient()
    const { data, error } = await supabase
      .from('courses')
      .select('id, title, difficulty, distance_km, elevation_gain_m, theme, tags')
      .order('created_at', { ascending: false })
      .limit(3)

    if (error || !data) return []
    return data as RecentCourse[]
  } catch {
    return []
  }
}

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

const courseGradients = [
  'from-[#21422d] to-[#3a6b4a]',
  'from-[#994200] to-[#c05400]',
  'from-[#1a3a5c] to-[#2d6099]',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  const courses = await fetchRecentCourses()

  return (
    <main className="min-h-[calc(100vh-64px)] overflow-hidden">

      {/* ------------------------------------------------------------------ */}
      {/* Hero Section */}
      {/* ------------------------------------------------------------------ */}
      <section
        className="relative px-6 py-12 md:px-12 lg:px-20 lg:py-20"
        style={{
          background: 'radial-gradient(circle at top, #21422d 0%, #102319 38%, #08150f 100%)',
        }}
      >
        <div className="relative mx-auto grid min-h-[calc(100vh-104px)] max-w-6xl items-center gap-12 lg:grid-cols-2">

          {/* Left — copy */}
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-medium tracking-[0.24em] text-white/72 uppercase">
              <span className="h-2 w-2 rounded-full bg-[#8FE36A]" />
              Gullim
            </div>

            <div
              className="font-headline font-black leading-none"
              style={{ fontSize: 'clamp(72px, 11vw, 156px)' }}
            >
              <span className="block text-primary">GULLIM</span>
              <span className="mt-1 block text-xs font-semibold tracking-[0.4em] text-white/50 uppercase">
                COURSE COMMUNITY
              </span>
            </div>

            <h1 className="font-headline mt-6 text-4xl font-bold leading-snug text-white md:text-5xl">
              페달을 굴리고,
              <br />
              <span className="text-white/80">함께 어울리는 코스 커뮤니티</span>
            </h1>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/courses"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                코스 탐색하기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/8 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/12"
              >
                코스 올리기
              </Link>
            </div>

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

          {/* Right — rider image + overlay card */}
          <div className="relative w-full">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl -rotate-2 transition-transform duration-500 hover:rotate-0">
              <Image
                src="https://images.unsplash.com/photo-1611866063945-9f5f4b157c34?w=700&q=80"
                alt="라이더가 자전거 코스를 달리는 모습"
                width={700}
                height={520}
                className="w-full object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/15 bg-black/50 px-4 py-3 backdrop-blur-md">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">Active Ride</p>
              <p className="mt-1 text-sm font-semibold text-white">좌부-예당호-도고-송악</p>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-white/60">
                <span>80 km</span>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <span>↑ 455 m</span>
                <span className="h-1 w-1 rounded-full bg-white/30" />
                <span className="text-[#8FE36A]">Road</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Features Section */}
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
      {/* Map Preview Section */}
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

          {/* Right — map placeholder */}
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{ aspectRatio: '4/3' }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 40% 45%, #3a6b4a 0%, #21422d 40%, #0f2518 100%)',
              }}
            />
            <div className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-white/20 bg-black/30 px-6 py-4 text-center backdrop-blur-sm">
                <MapPinned className="mx-auto mb-2 h-8 w-8 text-[#8FE36A]" />
                <p className="text-sm font-semibold text-white">지역 선택 후 탐색</p>
                <p className="mt-1 text-xs text-white/60">카카오맵 기반 인터랙티브 지도</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Recommended Courses Section */}
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
            {courses.length > 0 ? courses.map((course, idx) => (
              <article
                key={course.id}
                className="overflow-hidden rounded-2xl border border-stitch-outline/20 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Gradient image area */}
                <div className={`relative h-40 bg-gradient-to-br ${courseGradients[idx % courseGradients.length]}`}>
                  <span className="absolute left-3 top-3 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
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
                    <span>↑ {course.elevation_gain_m.toLocaleString()} m</span>
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
                  className={`overflow-hidden rounded-2xl bg-gradient-to-br ${courseGradients[idx]} opacity-60`}
                  style={{ height: '220px' }}
                >
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-white/70">코스 준비 중</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* CTA Banner */}
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
