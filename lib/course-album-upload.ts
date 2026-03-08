'use client'

import exifr from 'exifr'
import { supabase } from '@/lib/supabase'
import {
  buildCourseAlbumPhotoPath,
  COURSE_ALBUM_BUCKET,
  MAX_COURSE_ALBUM_UPLOAD_BYTES,
  normalizeAlbumCaption,
  toAlbumExifJson,
  type AlbumPhotoLocation,
} from '@/lib/course-album'
import type { Json } from '@/types/database'
import type { CourseAlbumPhoto } from '@/types/course'

const MAX_ALBUM_IMAGE_DIMENSION = 2048
const WEBP_QUALITY = 0.82

type ExtractedAlbumExif = {
  location: AlbumPhotoLocation | null
  takenAt: string | null
  sourceExifJson: Json | null
}

type PreparedAlbumImage = {
  file: File
  width: number
  height: number
}

type UploadCourseAlbumPhotoParams = {
  courseId: string
  accessToken: string
  userId: string
  file: File
  caption?: string | null
}

function normalizeExifDate(value: unknown) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }

  return null
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const image = new Image()
    image.decoding = 'async'

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('이미지 로딩에 실패했습니다.'))
      image.src = objectUrl
    })

    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function extractCourseAlbumExif(file: File): Promise<ExtractedAlbumExif> {
  const [gps, details] = await Promise.all([
    exifr.gps(file).catch(() => null),
    exifr.parse(file, ['DateTimeOriginal', 'Make', 'Model']).catch(() => null),
  ])

  const latitude = typeof gps?.latitude === 'number' ? gps.latitude : null
  const longitude = typeof gps?.longitude === 'number' ? gps.longitude : null

  return {
    location:
      latitude != null && longitude != null
        ? { lat: latitude, lng: longitude }
        : null,
    takenAt: normalizeExifDate(details?.DateTimeOriginal),
    sourceExifJson: toAlbumExifJson({
      latitude,
      longitude,
      takenAt: normalizeExifDate(details?.DateTimeOriginal),
      make: typeof details?.Make === 'string' ? details.Make : null,
      model: typeof details?.Model === 'string' ? details.Model : null,
    }),
  }
}

export async function convertImageFileToWebp(file: File): Promise<PreparedAlbumImage> {
  const image = await loadImageFromFile(file)
  const scale = Math.min(1, MAX_ALBUM_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale))
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('이미지 변환을 위한 캔버스를 준비하지 못했습니다.')
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error('WebP 변환에 실패했습니다.'))
          return
        }

        resolve(nextBlob)
      },
      'image/webp',
      WEBP_QUALITY,
    )
  })

  const output = new File(
    [blob],
    `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.webp`,
    { type: 'image/webp' },
  )

  return {
    file: output,
    width: targetWidth,
    height: targetHeight,
  }
}

export async function uploadCourseAlbumPhoto({
  courseId,
  accessToken,
  userId,
  file,
  caption,
}: UploadCourseAlbumPhotoParams): Promise<CourseAlbumPhoto> {
  if (file.size > MAX_COURSE_ALBUM_UPLOAD_BYTES) {
    throw new Error('앨범 사진은 20MB 이하 파일만 업로드할 수 있습니다.')
  }

  const [preparedFile, exifMetadata] = await Promise.all([
    convertImageFileToWebp(file),
    extractCourseAlbumExif(file),
  ])

  if (!exifMetadata.location) {
    throw new Error('GPS 위치 메타데이터가 있는 사진만 업로드할 수 있습니다.')
  }

  const storagePath = buildCourseAlbumPhotoPath({
    userId,
    courseId,
    sourceFileName: file.name,
  })

  const { error: uploadError } = await supabase.storage
    .from(COURSE_ALBUM_BUCKET)
    .upload(storagePath, preparedFile.file, {
      contentType: 'image/webp',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`앨범 사진 업로드 실패: ${uploadError.message}`)
  }

  const publicUrl = supabase.storage
    .from(COURSE_ALBUM_BUCKET)
    .getPublicUrl(storagePath)
    .data
    .publicUrl

  try {
    const response = await fetch(`/api/courses/${courseId}/album`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        storagePath,
        publicUrl,
        lat: exifMetadata.location.lat,
        lng: exifMetadata.location.lng,
        takenAt: exifMetadata.takenAt,
        caption: normalizeAlbumCaption(caption),
        width: preparedFile.width,
        height: preparedFile.height,
        sourceExifJson: exifMetadata.sourceExifJson,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(
        typeof payload?.error === 'string'
          ? payload.error
          : '앨범 사진 메타데이터 저장에 실패했습니다.',
      )
    }

    return payload.photo as CourseAlbumPhoto
  } catch (error) {
    const { error: cleanupError } = await supabase.storage
      .from(COURSE_ALBUM_BUCKET)
      .remove([storagePath])

    if (cleanupError) {
      console.error(
        '[course-album-upload] failed to cleanup uploaded file after metadata failure:',
        cleanupError.message,
        storagePath,
      )
    }

    throw error
  }
}
