'use client'

import type { ComponentType } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signInWithGoogle, signInWithKakao } from '@/lib/auth'

interface LoginSectionProps {
  icon?: ComponentType<{ className?: string }>
  title?: string
  description?: string
}

export function LoginSection({
  icon: Icon,
  title = '로그인이 필요합니다',
  description = '계속하려면 로그인해주세요.',
}: LoginSectionProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xs flex-col items-center justify-center gap-4 px-4 text-center">
      {Icon && <Icon className="h-12 w-12 text-muted-foreground" />}
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-2 flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => { void signInWithKakao() }}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-semibold text-[#191919] transition-colors hover:bg-[#FDD800]"
        >
          카카오로 시작하기
        </button>
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl text-sm font-semibold"
          onClick={() => { void signInWithGoogle() }}
        >
          <LogIn className="mr-2 h-4 w-4" />
          Google로 시작하기
        </Button>
      </div>
    </div>
  )
}
