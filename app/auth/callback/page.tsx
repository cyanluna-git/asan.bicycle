'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

async function getPostLoginDestination(userId: string): Promise<string> {
  // 1. sessionStorage에 임시 지역이 있으면 그걸 우선 사용
  const tempRegionId = sessionStorage.getItem('temporary_region_id')
  if (tempRegionId) {
    return `/courses?region=${tempRegionId}`
  }

  // 2. user_profiles의 home_region_id 조회
  const { data } = await supabase
    .from('user_profiles')
    .select('home_region_id')
    .eq('id', userId)
    .maybeSingle()

  if (data?.home_region_id) {
    return `/courses?region=${data.home_region_id}`
  }

  // 3. 지역 없으면 홈에서 지역 선택 모달 오픈
  return '/courses?setup-region=1'
}

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        subscription.unsubscribe()
        const destination = await getPostLoginDestination(session.user.id)
        router.replace(destination)
      } else if (event === 'SIGNED_OUT') {
        subscription.unsubscribe()
        router.replace('/?error=auth')
      }
    })

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        subscription.unsubscribe()
        const destination = await getPostLoginDestination(session.user.id)
        router.replace(destination)
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-sm text-muted-foreground">로그인 처리 중...</p>
    </div>
  )
}
