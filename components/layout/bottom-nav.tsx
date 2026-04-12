'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Map, User } from 'lucide-react'

export const tabs = [
  { icon: Map, label: '코스', href: '/courses' },
  { icon: User, label: '내 코스', href: '/my-courses' },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-stitch-surface/90 backdrop-blur-md md:hidden">
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map(({ icon: Icon, label, href }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={
                isActive
                  ? 'flex flex-col items-center gap-1 rounded-full bg-primary px-4 py-1.5 text-primary-foreground'
                  : 'flex flex-col items-center gap-1 px-4 py-1.5 text-muted-foreground'
              }
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
