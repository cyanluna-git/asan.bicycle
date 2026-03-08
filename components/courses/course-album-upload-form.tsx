'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_COURSE_ALBUM_CAPTION_LENGTH, MAX_COURSE_ALBUM_UPLOAD_BYTES } from '@/lib/course-album'
import { uploadCourseAlbumPhoto } from '@/lib/course-album-upload'
import { supabase } from '@/lib/supabase'
import type { CourseAlbumPhoto } from '@/types/course'

interface CourseAlbumUploadFormProps {
  courseId: string
  onUploaded?: (photo: CourseAlbumPhoto) => void
}

export function CourseAlbumUploadForm({
  courseId,
  onUploaded,
}: CourseAlbumUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError('업로드할 사진을 선택해주세요.')
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token || !session.user) {
      setError('앨범 사진 업로드에는 로그인이 필요합니다.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const photo = await uploadCourseAlbumPhoto({
        courseId,
        accessToken: session.access_token,
        userId: session.user.id,
        file: selectedFile,
        caption,
      })

      setSelectedFile(null)
      setCaption('')
      setSuccessMessage('앨범 사진이 업로드되었습니다.')
      onUploaded?.(photo)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '앨범 사진 업로드에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-3xl border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-2xl bg-orange-100 p-2 text-orange-600">
          <Upload className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">라이드 사진 업로드</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            사진의 GPS 메타를 읽고, 업로드 전 WebP로 변환해 저장합니다.
            위치 메타가 없는 사진은 업로드할 수 없습니다.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            사진 파일
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] ?? null)
              setError(null)
              setSuccessMessage(null)
            }}
            className="sr-only"
          />
          {selectedFile ? (
            <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 px-3 py-2.5">
              <ImagePlus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {selectedFile.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted"
                aria-label="선택 해제"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-4 py-5 text-sm font-medium text-muted-foreground transition-colors active:bg-muted/40"
            >
              <ImagePlus className="h-5 w-5" />
              사진 앨범에서 선택
            </button>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`course-album-caption-${courseId}`}>
            캡션
          </label>
          <textarea
            id={`course-album-caption-${courseId}`}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="예: 예당호 업힐 끝나고 본 풍경"
            maxLength={MAX_COURSE_ALBUM_CAPTION_LENGTH}
            rows={3}
            className="w-full rounded-2xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            최대 {(MAX_COURSE_ALBUM_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB 이미지, 캡션 {MAX_COURSE_ALBUM_CAPTION_LENGTH}자
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !selectedFile} className="w-full">
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          앨범 사진 업로드
        </Button>
      </div>
    </div>
  )
}
