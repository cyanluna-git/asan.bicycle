import Link from 'next/link'
import Image from 'next/image'
import { Bebas_Neue, Noto_Sans_KR } from 'next/font/google'
import { ArrowRight, Map, Mountain, Coffee, Download, MapPin, ChevronRight, Sparkles } from 'lucide-react'

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' })
const notoKr = Noto_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto' })

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const STATS = [
  { value: '20+', label: '라이딩 코스' },
  { value: '3', label: '난이도 레벨' },
  { value: '48+', label: '카페 · 맛집 · 편의점' },
  { value: '215', label: '최장 코스 (km)' },
]

const FEATURES = [
  {
    icon: Map,
    title: '지도에서 바로 확인',
    desc: '카카오맵 기반 인터랙티브 지도로 코스 전체 경로를 한눈에 파악. 출발지부터 도착지까지 실제 도로를 따라 그려진 경로를 확인하세요.',
    accent: '#C8E63A',
  },
  {
    icon: Mountain,
    title: '난이도별 코스 분류',
    desc: '초급부터 고급까지 체계적으로 분류된 코스. 거리·획득고도·예상 소요시간을 기준으로 오늘의 컨디션에 맞는 코스를 골라보세요.',
    accent: '#6EE7B7',
  },
  {
    icon: Coffee,
    title: '코스 위의 보급 정보',
    desc: '편의점, 카페, 맛집 등 코스 경로 위에 표시된 48개 이상의 보급 포인트. 어디서 쉬고, 뭘 먹을지 미리 계획하세요.',
    accent: '#FCA5A5',
  },
  {
    icon: Download,
    title: 'GPX 파일 다운로드',
    desc: '가민, 와후 등 사이클링 컴퓨터와 스마트폰 앱에 바로 넣을 수 있는 GPX 파일. 코스를 따라가며 실시간 내비게이션을 사용하세요.',
    accent: '#93C5FD',
  },
]

const DIFFICULTIES = [
  {
    level: '초급',
    en: 'EASY',
    color: '#22C55E',
    bg: '#DCFCE7',
    desc: '누구나 부담 없이 즐길 수 있는 평탄한 코스. 가족 나들이, 입문자 모두 환영.',
    examples: ['예당평화로 오전 라이딩 · 47km', '곡차~솔치 복귀 코스 · 59km', '정안~전의 초급 코스 · 68km'],
    distance: '47–68km',
    gain: '~700m',
  },
  {
    level: '중급',
    en: 'MODERATE',
    color: '#F59E0B',
    bg: '#FEF9C3',
    desc: '적당한 오르막과 거리로 라이딩 실력을 키우기에 최적. 반나절~하루 코스.',
    examples: ['차령~마곡사 역방향 · 75km', '메디오폰도 공식 코스 · 90km', '좌부~공주~유구 · 106km'],
    distance: '75–117km',
    gain: '800–1,100m',
  },
  {
    level: '고급',
    en: 'HARD',
    color: '#EF4444',
    bg: '#FEE2E2',
    desc: '체력과 경험이 필요한 도전적인 코스. 충남의 험준한 고갯길을 정복하세요.',
    examples: ['칠갑산 130km 클라이밍', '광천-수덕사 그란폰도 · 151km', '이화령 찍고 턴 · 215km'],
    distance: '130–215km',
    gain: '1,000–3,100m',
  },
]

const POIS = [
  { emoji: '🏪', label: '편의점', desc: 'GS25, CU 등 코스 길목 보급소', count: '18곳' },
  { emoji: '☕', label: '카페', desc: '뷰 좋은 카페부터 라이더 단골까지', count: '16곳' },
  { emoji: '🍽️', label: '맛집·식당', desc: '예당 매운탕, 천북 굴구이, 공주국밥', count: '14곳' },
]

const TOURISM_SPOTS = [
  {
    name: '현충사',
    category: '역사 유적',
    desc: '이순신 장군의 충의를 기리는 성역. 벚꽃 시즌 라이딩의 명소.',
    emoji: '🏯',
    color: '#DC2626',
  },
  {
    name: '은행나무길',
    category: '자연 경관',
    desc: '수백 년 된 은행나무가 줄지어 선 가을 황금빛 드라이브 코스.',
    emoji: '🍂',
    color: '#D97706',
  },
  {
    name: '공세리 성당',
    category: '종교 문화',
    desc: '100년 넘은 고딕 성당. 드라마 촬영지로도 유명한 아산의 보물.',
    emoji: '⛪',
    color: '#7C3AED',
  },
  {
    name: '삽교유원지',
    category: '자연 휴양',
    desc: '삽교천변 휴양지. 라이딩 후 자전거를 세우고 쉬어가기 좋은 곳.',
    emoji: '🌊',
    color: '#0284C7',
  },
]

// ---------------------------------------------------------------------------
// Route SVG (abstract cycling route lines)
// ---------------------------------------------------------------------------

function RouteSVG() {
  return (
    <svg
      viewBox="0 0 600 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full opacity-[0.07]"
      aria-hidden
    >
      <path d="M0 200 Q150 80 300 160 T600 120" stroke="#C8E63A" strokeWidth="2" />
      <path d="M0 280 Q200 150 350 220 T600 180" stroke="#C8E63A" strokeWidth="1.5" />
      <path d="M0 320 Q100 200 250 280 T600 240" stroke="white" strokeWidth="1" />
      <path d="M50 0 Q180 100 200 200 Q220 300 300 350" stroke="white" strokeWidth="1" />
      <path d="M200 0 Q280 120 320 200 Q360 280 420 400" stroke="#C8E63A" strokeWidth="1.5" />
      <path d="M400 0 Q450 80 480 180 Q510 280 560 400" stroke="white" strokeWidth="1" />
      {/* Dots for POIs */}
      <circle cx="180" cy="155" r="4" fill="#C8E63A" />
      <circle cx="320" cy="218" r="4" fill="#C8E63A" />
      <circle cx="460" cy="175" r="4" fill="white" />
      <circle cx="250" cy="275" r="3" fill="white" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Topo background (subtle grid lines)
// ---------------------------------------------------------------------------

function TopoBg() {
  return (
    <svg
      viewBox="0 0 800 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full opacity-[0.04]"
      aria-hidden
    >
      {[0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600].map((y) => (
        <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="white" strokeWidth="1" />
      ))}
      {[0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800].map((x) => (
        <line key={x} x1={x} y1="0" x2={x} y2="600" stroke="white" strokeWidth="1" />
      ))}
      {/* Topo contour-like curves */}
      <ellipse cx="400" cy="300" rx="200" ry="120" stroke="white" strokeWidth="1" />
      <ellipse cx="400" cy="300" rx="300" ry="200" stroke="white" strokeWidth="1" />
      <ellipse cx="200" cy="200" rx="120" ry="80" stroke="white" strokeWidth="1" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div
      className={`${bebas.variable} ${notoKr.variable}`}
      style={{ fontFamily: 'var(--font-noto), var(--font-geist-sans)', background: '#F4F0E7' }}
    >

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col justify-center overflow-hidden px-6 md:px-16 lg:px-24"
        style={{
          minHeight: 'calc(100vh - 64px)',
          background: 'linear-gradient(135deg, #0A1F12 0%, #122A1C 50%, #0D2318 100%)',
        }}
      >
        <TopoBg />
        <RouteSVG />

        {/* Content */}
        <div className="relative z-10 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16">
          {/* Left: Text */}
          <div>
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 text-xs font-medium tracking-widest uppercase"
              style={{ background: 'rgba(200,230,58,0.15)', color: '#C8E63A', border: '1px solid rgba(200,230,58,0.3)' }}
            >
              <MapPin className="w-3 h-3" />
              아산시 기점 자전거 코스 허브
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily: 'var(--font-bebas)',
                lineHeight: 0.92,
                letterSpacing: '0.01em',
              }}
              className="text-white mb-6"
            >
              <span className="block" style={{ fontSize: 'clamp(64px, 9vw, 130px)', color: '#C8E63A' }}>
                ASAN
              </span>
              <span className="block" style={{ fontSize: 'clamp(44px, 6vw, 88px)', color: 'rgba(255,255,255,0.9)' }}>
                자전거 코스
              </span>
              <span className="block" style={{ fontSize: 'clamp(44px, 6vw, 88px)', color: 'rgba(255,255,255,0.55)' }}>
                모두 여기서
              </span>
            </h1>

            {/* Sub */}
            <p
              className="mb-10 leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.05rem', maxWidth: '480px' }}
            >
              네이버 밴드, 카카오톡 오픈채팅방에 흩어져 있던 아산 라이딩 코스를
              한 곳에 모았습니다. 난이도별·거리별 코스와 코스 위의 카페·맛집·편의점을
              지도에서 한눈에 확인하세요.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-sm transition-all hover:gap-3"
                style={{ background: '#C8E63A', color: '#0A1F12' }}
              >
                코스 탐색 시작
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-medium transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                서비스 소개
              </a>
            </div>
          </div>

          {/* Right: Course cards preview */}
          <div className="hidden lg:flex flex-col gap-3">
            {[
              { title: '이화령 찍고 턴 215km', badge: '고급', dist: '215km', gain: '3,125m', color: '#FCA5A5' },
              { title: '2024 그란폰도 공식 코스', badge: '고급', dist: '111km', gain: '1,123m', color: '#FCA5A5' },
              { title: '메디오폰도 공식 코스 90km', badge: '중급', dist: '90km', gain: '810m', color: '#FDE68A' },
              { title: '예당평화로 오전 라이딩', badge: '초급', dist: '47km', gain: '133m', color: '#A7F3D0' },
            ].map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl px-5 py-4"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="shrink-0 w-2 h-8 rounded-full"
                  style={{ background: c.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    거리 {c.dist} · 고도 ↑ {c.gain}
                  </p>
                </div>
                <span
                  className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{ background: c.color + '22', color: c.color }}
                >
                  {c.badge}
                </span>
              </div>
            ))}
            <p className="text-center text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              + 16개 코스 더보기
            </p>
          </div>
        </div>

        {/* Bottom fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent, #F4F0E7)' }}
        />
      </section>

      {/* ── STATS ─────────────────────────────────────────────────────── */}
      <section style={{ background: '#F4F0E7' }} className="py-12 px-6 md:px-16 lg:px-24">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div
                style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(48px, 6vw, 72px)', color: '#0A1F12', lineHeight: 1 }}
              >
                {s.value}
              </div>
              <div className="text-sm mt-1" style={{ color: '#6B7280' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-6 md:mx-16 lg:mx-24 h-px" style={{ background: '#D9D3C5' }} />

      {/* ── FEATURES ──────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-6 md:px-16 lg:px-24" style={{ background: '#F4F0E7' }}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#8B7355' }}>
              주요 기능
            </p>
            <h2
              style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(36px, 5vw, 60px)', color: '#0A1F12', lineHeight: 1.05 }}
            >
              라이딩에 필요한 모든 정보
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="rounded-2xl p-7 transition-all hover:-translate-y-0.5"
                  style={{ background: 'white', border: '1px solid #E8E3D8' }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: f.accent + '22' }}
                  >
                    <Icon className="w-5 h-5" style={{ color: f.accent === '#C8E63A' ? '#5a6e00' : f.accent.replace('22', '') }} />
                  </div>
                  <h3 className="font-bold text-base mb-2" style={{ color: '#0A1F12' }}>
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    {f.desc}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── DIFFICULTY ────────────────────────────────────────────────── */}
      <section
        className="py-20 px-6 md:px-16 lg:px-24"
        style={{ background: '#0A1F12' }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'rgba(200,230,58,0.7)' }}>
              난이도 가이드
            </p>
            <h2
              style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(36px, 5vw, 60px)', color: 'white', lineHeight: 1.05 }}
            >
              체력에 맞는 코스를 골라보세요
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {DIFFICULTIES.map((d) => (
              <div
                key={d.level}
                className="rounded-2xl p-7 flex flex-col gap-5"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: d.color + '22', color: d.color }}
                  >
                    {d.level}
                  </span>
                  <span
                    style={{ fontFamily: 'var(--font-bebas)', fontSize: 28, color: d.color, opacity: 0.4 }}
                  >
                    {d.en}
                  </span>
                </div>

                {/* Desc */}
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {d.desc}
                </p>

                {/* Stats */}
                <div className="flex gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span>거리 {d.distance}</span>
                  <span>고도 ↑ {d.gain}</span>
                </div>

                {/* Example courses */}
                <ul className="flex flex-col gap-2">
                  {d.examples.map((ex) => (
                    <li key={ex} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <ChevronRight className="w-3 h-3 shrink-0" style={{ color: d.color }} />
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── POI HIGHLIGHT ─────────────────────────────────────────────── */}
      <section className="py-20 px-6 md:px-16 lg:px-24" style={{ background: '#F4F0E7' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#8B7355' }}>
                들릴만한 곳
              </p>
              <h2
                style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(36px, 5vw, 60px)', color: '#0A1F12', lineHeight: 1.05 }}
                className="mb-5"
              >
                코스 위의 카페·맛집·편의점까지
              </h2>
              <p className="text-sm leading-relaxed mb-8" style={{ color: '#6B7280', maxWidth: 440 }}>
                수덕사 입구 카페, 예당저수지 매운탕, 천북 굴구이, 공주국밥까지.
                코스별 48개 이상의 보급 포인트가 지도와 상세 패널에 함께 표시됩니다.
                라이딩 전에 어디서 쉬고 뭘 먹을지 미리 계획하세요.
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: '#0A1F12', borderBottom: '2px solid #C8E63A', paddingBottom: '2px' }}
              >
                지도에서 확인하기
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* POI cards */}
            <div className="flex flex-col gap-4">
              {POIS.map((p) => (
                <div
                  key={p.label}
                  className="flex items-center gap-5 rounded-2xl px-6 py-5"
                  style={{ background: 'white', border: '1px solid #E8E3D8' }}
                >
                  <span className="text-4xl">{p.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm" style={{ color: '#0A1F12' }}>{p.label}</span>
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: '#F4F0E7', color: '#6B7280' }}
                      >
                        {p.count}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: '#9CA3AF' }}>{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TOURISM SPOTS ─────────────────────────────────────────────── */}
      <section
        className="py-20 px-6 md:px-16 lg:px-24 relative overflow-hidden"
        style={{ background: '#0A1F12' }}
      >
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle, #C8E63A 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-6xl mx-auto">
          {/* Header row */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <div
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-4 text-xs font-bold tracking-wider uppercase"
                style={{ background: 'rgba(200,230,58,0.15)', color: '#C8E63A', border: '1px solid rgba(200,230,58,0.3)' }}
              >
                <Sparkles className="w-3 h-3" />
                준비중
              </div>
              <h2
                style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(36px, 5vw, 60px)', color: 'white', lineHeight: 1.05 }}
              >
                아산 문화 관광 명소도<br />코스 위에 표시됩니다
              </h2>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 460 }}>
                자전거 코스 경로 위에 역사 유적, 자연 경관, 종교 문화 명소가 지도 마커로 추가될 예정입니다.
                아산시의 모든 관광 자원을 라이딩 경험과 함께 연결합니다.
              </p>
            </div>

            {/* 아산시 로고 */}
            <div
              className="shrink-0 flex items-center gap-3 rounded-2xl px-6 py-4"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Image
                src="/asan-logo.svg"
                alt="아산시 로고"
                width={80}
                height={48}
                className="object-contain"
              />
              <div>
                <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>공식 문화관광 데이터</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>아산시 관광 자원 연계 예정</p>
              </div>
            </div>
          </div>

          {/* Spot cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TOURISM_SPOTS.map((spot) => (
              <div
                key={spot.name}
                className="rounded-2xl p-6 flex flex-col gap-4 relative"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div
                  className="absolute top-4 right-4 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(200,230,58,0.15)', color: '#C8E63A', fontSize: 10 }}
                >
                  예정
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: spot.color + '22' }}
                >
                  {spot.emoji}
                </div>
                <div>
                  <span
                    className="inline-block text-xs font-semibold mb-1.5 px-2 py-0.5 rounded"
                    style={{ background: spot.color + '22', color: spot.color }}
                  >
                    {spot.category}
                  </span>
                  <h3 className="font-bold text-base mb-2" style={{ color: 'white' }}>
                    {spot.name}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {spot.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            아산시 문화관광 지도와 연계하여 더 풍부한 라이딩 경험을 제공할 예정입니다
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section
        className="py-24 px-6 md:px-16 lg:px-24 text-center relative overflow-hidden"
        style={{ background: '#C8E63A' }}
      >
        {/* Background decoration */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #0A1F12 0, #0A1F12 1px, transparent 0, transparent 50%)',
            backgroundSize: '20px 20px',
          }}
        />
        <div className="relative max-w-2xl mx-auto">
          <h2
            style={{ fontFamily: 'var(--font-bebas)', fontSize: 'clamp(42px, 7vw, 80px)', color: '#0A1F12', lineHeight: 0.95 }}
            className="mb-5"
          >
            지금 바로 아산 라이딩을 탐색하세요
          </h2>
          <p className="text-sm mb-8 font-medium" style={{ color: '#0A1F12', opacity: 0.7 }}>
            20개 코스 · 48개 보급지 · 무료 GPX 다운로드
          </p>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-full px-8 py-4 font-bold text-base transition-all hover:gap-3"
            style={{ background: '#0A1F12', color: '#C8E63A' }}
          >
            코스 탐색 시작
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer
        className="py-10 px-6 md:px-16 lg:px-24"
        style={{ background: '#0A1F12' }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span style={{ fontFamily: 'var(--font-bebas)', fontSize: 22, color: '#C8E63A', letterSpacing: '0.05em' }}>
            ASAN.BICYCLE
          </span>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            아산시 자전거 코스 허브 · Built with Next.js & Supabase
          </p>
          <Link href="/explore" className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
            코스 탐색 →
          </Link>
        </div>
      </footer>

    </div>
  )
}
