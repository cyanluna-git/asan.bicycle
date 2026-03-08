'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { CalendarDays, Camera, ImagePlus, Loader2, LogIn, MapPinned, RefreshCcw, Trash2, X } from 'lucide-react'
import { CourseAlbumUploadForm } from '@/components/courses/course-album-upload-form'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { CourseAlbumPhoto } from '@/types/course'

interface CourseAlbumSurfaceProps {
  courseId: string
  courseTitle: string
  isLoggedIn: boolean
  currentUserId?: string | null
  isAdmin?: boolean
  photos: CourseAlbumPhoto[]
  isLoading: boolean
  error: string | null
  selectedPhotoId?: string | null
  onRetry?: () => void
  onUploaded?: (photo: CourseAlbumPhoto) => void
  onSelectPhoto?: (photoId: string | null) => void
  onDeletedPhoto?: (photoId: string) => void
  onClose?: () => void
  className?: string
}

function formatDate(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(date)
}

export function CourseAlbumSurface({
  courseId,
  courseTitle,
  isLoggedIn,
  currentUserId = null,
  isAdmin = false,
  photos,
  isLoading,
  error,
  selectedPhotoId = null,
  onRetry,
  onUploaded,
  onSelectPhoto,
  onDeletedPhoto,
  onClose,
  className,
}: CourseAlbumSurfaceProps) {
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const geotaggedCount = useMemo(
    () => photos.filter((photo) => photo.lat != null && photo.lng != null).length,
    [photos],
  )
  const latestShotDate = formatDate(photos[0]?.taken_at ?? photos[0]?.created_at ?? null)

  const handleDeletePhoto = async (photoId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      return
    }

    setDeletingPhotoId(photoId)

    try {
      const response = await fetch(`/api/courses/${courseId}/album`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ photoId }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : '앨범 사진 삭제에 실패했습니다.',
        )
      }

      onDeletedPhoto?.(photoId)
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : '앨범 사진 삭제에 실패했습니다.')
    } finally {
      setDeletingPhotoId(null)
    }
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2',
        className,
      )}
    >
      <div className="border-b bg-[linear-gradient(180deg,_rgba(247,243,234,0.98)_0%,_rgba(255,255,255,0.98)_100%)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Ride Album
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-foreground">
              {courseTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              이 코스 위에서 찍은 라이딩 사진을 모아보고, 위치가 있는 사진은 지도 위 경험 포인트로 이어집니다.
            </p>
          </div>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 shrink-0 rounded-full bg-background/80 shadow-sm"
              onClick={onClose}
              aria-label="앨범 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <AlbumStatCard icon={<Camera className="h-3.5 w-3.5 text-foreground/70" />} label="사진 수" value={`${photos.length}장`} />
          <AlbumStatCard icon={<MapPinned className="h-3.5 w-3.5 text-foreground/70" />} label="지도 표시" value={`${geotaggedCount}장`} />
          <AlbumStatCard icon={<CalendarDays className="h-3.5 w-3.5 text-foreground/70" />} label="최근 촬영" value={latestShotDate ?? '-'} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {isLoggedIn ? (
            <CourseAlbumUploadForm
              courseId={courseId}
              onUploaded={onUploaded}
            />
          ) : (
            <div className="rounded-[24px] border bg-[linear-gradient(180deg,_rgba(248,244,236,0.95),_rgba(255,255,255,0.98))] p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <ImagePlus className="h-3.5 w-3.5" />
                    Add a Photo
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    라이딩 사진을 올리려면 로그인이 필요합니다.
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    GPS가 있는 사진이면 자동으로 코스 지도 위 위치까지 연결됩니다.
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    await signInWithGoogle()
                  }}
                  className="shrink-0 rounded-full"
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  로그인
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-center justify-between gap-3">
                <span>{error}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto shrink-0 px-2 py-0 text-red-700 underline"
                  onClick={onRetry}
                >
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                  다시 시도
                </Button>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-[24px] border bg-card shadow-sm">
                  <div className="aspect-[4/3] animate-pulse bg-muted/60" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted/50" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted/50" />
                  </div>
                </div>
              ))}
            </div>
          ) : photos.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {photos.map((photo) => (
                <article
                  key={photo.id}
                  className={cn(
                    'overflow-hidden rounded-[24px] border bg-card shadow-sm transition',
                    selectedPhotoId === photo.id
                      ? 'border-foreground/60 ring-2 ring-foreground/10'
                      : 'hover:border-foreground/20',
                  )}
                >
                  <div className="relative aspect-[4/3] bg-muted/30">
                    <Image
                      src={photo.public_url}
                      alt={photo.caption ?? `${courseTitle} 라이딩 사진`}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 360px"
                      className="object-cover"
                      loading="lazy"
                    />
                    {(isAdmin || currentUserId === photo.user_id) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-2 h-8 w-8 rounded-full bg-background/85 shadow-sm"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void handleDeletePhoto(photo.id)
                        }}
                        disabled={deletingPhotoId === photo.id}
                        aria-label="앨범 사진 삭제"
                      >
                        {deletingPhotoId === photo.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectPhoto?.(selectedPhotoId === photo.id ? null : photo.id)}
                    className="block w-full space-y-2 p-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(photo.taken_at ?? photo.created_at) ?? '날짜 없음'}</span>
                      <span>{photo.lat != null && photo.lng != null ? '지도 표시 가능' : '위치 없음'}</span>
                    </div>
                    <p className="text-sm font-medium leading-relaxed text-foreground">
                      {photo.caption?.trim() || '캡션 없는 라이딩 사진'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPinned className="h-3.5 w-3.5" />
                      <span>
                        {photo.lat != null && photo.lng != null
                          ? `${photo.lat.toFixed(4)}, ${photo.lng.toFixed(4)}`
                          : '좌표 없음'}
                      </span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[28px] border border-dashed bg-[linear-gradient(180deg,_rgba(248,244,236,0.95),_rgba(255,255,255,0.96))] px-5 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <Camera className="h-5 w-5" />
              </div>
              <p className="text-base font-semibold text-foreground">아직 등록된 라이드 사진이 없습니다.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                이 코스에서 본 풍경, 휴식 지점, 노면 상태를 사진으로 남기면 다음 라이더가 코스를 더 잘 이해할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AlbumStatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/80 px-3 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground">
        {value}
      </p>
    </div>
  )
}
