'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const DISMISS_KEY = 'push_prompt_dismissed_at'
const DISMISS_DAYS = 7
const SHOW_DELAY_MS = 30_000

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function setDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

async function subscribeToPush(): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidKey,
  })

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return false

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(subscription.toJSON()),
  })

  return res.ok
}

export function NotificationPrompt() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    if (!('serviceWorker' in navigator)) return
    if (isDismissed()) return

    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return

      const timer = setTimeout(() => {
        if (!cancelled) setVisible(true)
      }, SHOW_DELAY_MS)

      return () => clearTimeout(timer)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const handleAllow = useCallback(async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await subscribeToPush()
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setVisible(false)
    }
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed()
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 rounded-xl border bg-background p-4 shadow-lg md:left-auto md:right-6 md:w-80">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:text-foreground"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">새 코스 알림을 받으시겠어요?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            내 지역에 새 코스가 등록되면 알려드려요.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleAllow} disabled={loading}>
          허용
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={handleDismiss}>
          나중에
        </Button>
      </div>
    </div>
  )
}
