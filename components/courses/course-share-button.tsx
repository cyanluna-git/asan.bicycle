'use client'

import React from 'react'
import Script from 'next/script'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSiteUrl } from '@/lib/site-url'

const KAKAO_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.9/kakao.min.js'

declare global {
  interface Window {
    Kakao?: {
      isInitialized?: () => boolean
      init: (key: string) => void
      Share?: {
        sendDefault: (payload: Record<string, unknown>) => void
      }
    }
  }
}

export function CourseShareButton({
  courseId,
  courseTitle,
  description,
  imageUrl,
}: {
  courseId: string
  courseTitle: string
  description: string
  imageUrl?: string | null
}) {
  const [sdkReady, setSdkReady] = useState(false)
  const javascriptKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim() || ''
  const shareUrl = `${getSiteUrl()}/courses/${courseId}`
  const previewImageUrl = imageUrl || `${getSiteUrl()}/opengraph-image`

  const handleShare = async () => {
    const normalizedDescription = description.trim()

    try {
      if (sdkReady && javascriptKey && window.Kakao?.Share) {
        if (!window.Kakao.isInitialized?.()) {
          window.Kakao.init(javascriptKey)
        }

        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: courseTitle,
            description: normalizedDescription,
            imageUrl: previewImageUrl,
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
          buttons: [
            {
              title: '코스 보기',
              link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl,
              },
            },
          ],
        })
        return
      }

      if (navigator.share) {
        await navigator.share({
          title: courseTitle,
          text: normalizedDescription,
          url: shareUrl,
        })
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
        window.alert('코스 링크를 복사했습니다.')
        return
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      {javascriptKey ? (
        <Script
          src={KAKAO_SDK_SRC}
          strategy="afterInteractive"
          onLoad={() => setSdkReady(true)}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:w-auto"
        onClick={() => {
          void handleShare()
        }}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        카카오 공유
      </Button>
    </>
  )
}
