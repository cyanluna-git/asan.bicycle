'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const DISMISS_KEY = 'pwa_install_dismissed_at'
const DISMISS_DAYS = 7

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const dismissedAt = Number(raw)
    return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // ignore
  }
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as Record<string, unknown>).standalone === true)
  )
}

export function InstallPromptBanner() {
  const [visible, setVisible] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone() || isDismissed()) return

    if (isIOS()) {
      setShowIOSGuide(true)
      setVisible(true)
      return
    }

    const handler = (event: Event) => {
      event.preventDefault()
      deferredPromptRef.current = event as BeforeInstallPromptEvent
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    const prompt = deferredPromptRef.current
    if (!prompt) return

    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    deferredPromptRef.current = null
  }, [])

  const handleDismiss = useCallback(() => {
    dismiss()
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 rounded-xl border bg-background p-4 shadow-lg md:left-auto md:right-6 md:w-80">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:text-foreground"
        aria-label="닫기"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-6">
        <p className="text-sm font-medium">굴림을 홈 화면에 추가하세요</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {showIOSGuide
            ? 'Safari 하단의 공유 버튼을 누른 뒤 "홈 화면에 추가"를 선택하세요.'
            : '더 빠르게 코스를 찾고 라이딩을 기록하세요.'}
        </p>
      </div>

      {showIOSGuide ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Share className="h-4 w-4 shrink-0" />
          <span>공유 &rarr; 홈 화면에 추가</span>
        </div>
      ) : (
        <Button size="sm" className="mt-3 w-full gap-2" onClick={handleInstall}>
          <Download className="h-4 w-4" />
          설치하기
        </Button>
      )}
    </div>
  )
}
