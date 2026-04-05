import Link from 'next/link'
import { Globe, Share2 } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-stone-800 text-stone-300">
      <div className="mx-auto max-w-6xl px-6 py-12 md:px-12 lg:px-20">
        <div className="grid gap-8 md:grid-cols-3">

          {/* Brand */}
          <div>
            <p className="font-headline text-xl font-bold text-stone-50">Gul<span className="text-[#E8690A]">.rim</span></p>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">
              전국 자전거 코스를 탐색하고,
              <br />
              함께 달리는 라이딩 커뮤니티
            </p>
          </div>

          {/* Quick links */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-500">
              Quick Links
            </p>
            <nav className="flex flex-col gap-2">
              {[
                { label: '코스 찾기', href: '/courses' },
                { label: '코스 올리기', href: '/upload' },
                { label: '내 코스', href: '/my-courses' },
                { label: '지도 탐색', href: '/explore' },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-sm transition hover:text-stone-50"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Social */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-stone-500">
              Connect
            </p>
            <div className="flex gap-3">
              <a
                href="#"
                aria-label="웹사이트"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-700 transition hover:bg-primary"
              >
                <Globe className="h-4 w-4" />
              </a>
              <a
                href="#"
                aria-label="공유"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-700 transition hover:bg-primary"
              >
                <Share2 className="h-4 w-4" />
              </a>
            </div>
          </div>

        </div>

        <div className="mt-10 border-t border-stone-700 pt-6 text-xs text-stone-500">
          © 2025 Gullim Cycling. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
