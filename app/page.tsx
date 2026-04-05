import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Compass, Download, MapPinned } from 'lucide-react'

const featurePills = [
  { icon: MapPinned, label: '내 지역 출발' },
  { icon: Compass, label: 'Road / MTB' },
  { icon: Download, label: '즉시 GPX' },
] as const

export default function LandingPage() {
  return (
    <main
      className="min-h-[calc(100vh-64px)] overflow-hidden"
      style={{
        background: 'radial-gradient(circle at top, #21422d 0%, #102319 38%, #08150f 100%)',
      }}
    >
      <section className="relative px-6 py-12 md:px-12 lg:px-20 lg:py-20">
        <div className="relative mx-auto grid min-h-[calc(100vh-104px)] max-w-6xl items-center gap-12 lg:grid-cols-2">

          {/* Left — copy */}
          <div className="max-w-2xl">
            {/* Brand label */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs font-medium tracking-[0.24em] text-white/72 uppercase">
              <span className="h-2 w-2 rounded-full bg-[#8FE36A]" />
              Gullim
            </div>

            {/* Display headline */}
            <div
              className="font-headline font-black leading-none"
              style={{ fontSize: 'clamp(72px, 11vw, 156px)' }}
            >
              <span className="block text-primary">GULLIM</span>
              <span className="mt-1 block text-xs font-semibold tracking-[0.4em] text-white/50 uppercase">
                COURSE COMMUNITY
              </span>
            </div>

            {/* Subheadline */}
            <h1 className="font-headline mt-6 text-4xl font-bold leading-snug text-white md:text-5xl">
              페달을 굴리고,
              <br />
              <span className="text-white/80">함께 어울리는 코스 커뮤니티</span>
            </h1>

            {/* CTA buttons */}
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

            {/* Feature pills */}
            <div className="mt-8 flex flex-wrap gap-2">
              {featurePills.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-3 py-1.5 text-xs text-white/70 backdrop-blur-sm"
                >
                  <Icon className="h-3.5 w-3.5 text-[#8FE36A]" />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Right — rider image + overlay card */}
          <div className="relative w-full">
            <div className="relative overflow-hidden rounded-2xl shadow-2xl transition-transform duration-500 hover:-rotate-0 -rotate-2">
              <Image
                src="https://images.unsplash.com/photo-1611866063945-9f5f4b157c34?w=700&q=80"
                alt="라이더가 자전거 코스를 달리는 모습"
                width={700}
                height={520}
                className="w-full object-cover"
                priority
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </div>

            {/* Active Ride overlay card */}
            <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-white/15 bg-black/50 px-4 py-3 backdrop-blur-md">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
                Active Ride
              </p>
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
    </main>
  )
}
