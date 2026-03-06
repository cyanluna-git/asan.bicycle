import Link from 'next/link'
import { Bebas_Neue, Noto_Sans_KR } from 'next/font/google'
import { ArrowRight, Compass, Download, MapPinned, Mountain, Route } from 'lucide-react'

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
})

const notoKr = Noto_Sans_KR({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-noto',
})

const laneCards = [
  {
    label: 'ROAD',
    title: '빠르게 이어지는 아산 출발 로드 코스',
    body: '평지 위주 스피드 루프부터 장거리 업힐 루트까지 한 번에.',
    icon: Route,
    tone: '#FFD84D',
  },
  {
    label: 'MTB',
    title: '임도와 오르막이 살아있는 MTB 라인업',
    body: '거친 구간, 고도, 복귀 동선을 짧고 명확하게 확인.',
    icon: Mountain,
    tone: '#8FE36A',
  },
] as const

const quickPoints = [
  {
    icon: MapPinned,
    title: '아산시 출발',
    body: '출발지 기준으로 바로 고르기',
  },
  {
    icon: Compass,
    title: 'Road / MTB',
    body: '스타일별로 빠르게 분기',
  },
  {
    icon: Download,
    title: '즉시 GPX',
    body: '다운로드 후 바로 라이딩',
  },
] as const

function GridGlow() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-40"
      style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(circle at center, black 45%, transparent 85%)',
      }}
    />
  )
}

function RouteLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 520"
      className="absolute inset-0 h-full w-full opacity-60"
      fill="none"
    >
      <path
        d="M-40 390C99 381 110 180 248 188C386 196 414 434 547 428C680 422 676 262 850 274"
        stroke="#FFD84D"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M-10 286C149 303 162 111 332 126C501 141 489 344 628 337C766 330 704 161 846 139"
        stroke="#8FE36A"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="8 10"
      />
      <circle cx="248" cy="188" r="8" fill="#FFD84D" />
      <circle cx="332" cy="126" r="8" fill="#8FE36A" />
      <circle cx="547" cy="428" r="8" fill="#FFD84D" />
      <circle cx="628" cy="337" r="8" fill="#8FE36A" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main
      className={`${bebas.variable} ${notoKr.variable} min-h-[calc(100vh-64px)] overflow-hidden`}
      style={{
        fontFamily: 'var(--font-noto), var(--font-geist-sans)',
        background:
          'radial-gradient(circle at top, #21422d 0%, #102319 38%, #08150f 100%)',
      }}
    >
      <section className="relative px-6 py-10 md:px-12 lg:px-20 lg:py-16">
        <GridGlow />
        <RouteLines />

        <div className="relative mx-auto grid min-h-[calc(100vh-104px)] max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-medium tracking-[0.24em] text-white/72 uppercase">
              <span className="h-2 w-2 rounded-full bg-[#8FE36A]" />
              Asan Bicycle
            </div>

            <h1
              className="text-white"
              style={{
                fontFamily: 'var(--font-bebas)',
                lineHeight: 0.88,
                letterSpacing: '0.01em',
                fontSize: 'clamp(72px, 11vw, 156px)',
              }}
            >
              ASAN
              <span className="block text-white/74">ROAD / MTB</span>
              <span className="block text-[#FFD84D]">START HERE</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/68 md:text-lg">
              아산시에서 출발하는 로드와 MTB 코스를 짧고 선명하게.
              코스 선택, 지도 확인, GPX 다운로드까지 한 번에 끝내는
              라이딩 브랜딩 허브.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-full bg-[#FFD84D] px-6 py-3 text-sm font-semibold text-[#102319] transition hover:bg-[#ffe277]"
              >
                코스 바로 보기
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/12"
              >
                내 코스 올리기
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {quickPoints.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-sm"
                >
                  <Icon className="mb-3 h-5 w-5 text-[#8FE36A]" />
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-white/55">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full">
            <div className="rounded-[32px] border border-white/10 bg-white/8 p-4 shadow-2xl backdrop-blur-md sm:p-5">
              <div className="rounded-[26px] border border-white/10 bg-[#0d1d15] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-white/40">
                      Brand Snapshot
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      아산 출발 코스만 빠르게
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-[#FFD84D]">
                    local routes
                  </div>
                </div>

                <div className="space-y-3">
                  {laneCards.map(({ label, title, body, icon: Icon, tone }) => (
                    <div
                      key={label}
                      className="rounded-3xl border border-white/10 bg-white/6 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p
                            className="text-xs font-semibold tracking-[0.24em]"
                            style={{ color: tone }}
                          >
                            {label}
                          </p>
                          <p className="mt-2 text-lg font-semibold leading-snug text-white">
                            {title}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-white/58">
                            {body}
                          </p>
                        </div>
                        <div
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                          style={{ background: `${tone}22`, color: tone }}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-3xl border border-dashed border-white/12 px-4 py-4 text-sm text-white/62">
                  길게 설명하지 않습니다.
                  <span className="ml-1 text-white">아산에서 출발하고, 바로 타면 됩니다.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
