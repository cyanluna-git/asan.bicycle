import type { Json } from '@/types/database'

export const COURSE_ALBUM_BUCKET = 'course-album-photos'
export const MAX_COURSE_ALBUM_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_COURSE_ALBUM_CAPTION_LENGTH = 180
export const MAX_COURSE_ALBUM_PHOTOS_PER_USER_PER_COURSE = 30
export const DEFAULT_COURSE_ALBUM_FETCH_LIMIT = 60
export const MAX_COURSE_ALBUM_FETCH_LIMIT = 120
const PUBLIC_BUCKET_PATH = `/storage/v1/object/public/${COURSE_ALBUM_BUCKET}/`

export type AlbumPhotoLocation = {
  lat: number
  lng: number
}

type BuildCourseAlbumPhotoPathParams = {
  userId: string
  courseId: string
  sourceFileName: string
  now?: Date
}

export function sanitizeAlbumPhotoBaseName(sourceFileName: string) {
  const withoutExtension = sourceFileName.replace(/\.[^.]+$/, '')
  const sanitized = withoutExtension.replace(/[^\w\-_.]/g, '_').replace(/_+/g, '_').trim()
  return sanitized || 'photo'
}

export function buildCourseAlbumPhotoPath({
  userId,
  courseId,
  sourceFileName,
  now = new Date(),
}: BuildCourseAlbumPhotoPathParams) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const baseName = sanitizeAlbumPhotoBaseName(sourceFileName)
  return `${userId}/${courseId}/${timestamp}_${baseName}.webp`
}

export function extractCourseAlbumPhotoPath(photoUrl: string | null | undefined) {
  if (!photoUrl) {
    return null
  }

  try {
    const url = new URL(photoUrl)
    const markerIndex = url.pathname.indexOf(PUBLIC_BUCKET_PATH)

    if (markerIndex === -1) {
      return null
    }

    const path = url.pathname.slice(markerIndex + PUBLIC_BUCKET_PATH.length)
    return path ? decodeURIComponent(path) : null
  } catch {
    return null
  }
}

export function isValidAlbumPhotoLocation(location: unknown): location is AlbumPhotoLocation {
  if (!location || typeof location !== 'object') {
    return false
  }

  const candidate = location as Partial<AlbumPhotoLocation>
  return (
    typeof candidate.lat === 'number'
    && Number.isFinite(candidate.lat)
    && typeof candidate.lng === 'number'
    && Number.isFinite(candidate.lng)
  )
}

export function resolveAlbumPhotoLocation(
  exifLocation: AlbumPhotoLocation | null | undefined,
  manualLocation: AlbumPhotoLocation | null | undefined,
) {
  if (isValidAlbumPhotoLocation(exifLocation)) {
    return exifLocation
  }

  if (isValidAlbumPhotoLocation(manualLocation)) {
    return manualLocation
  }

  return null
}

export function normalizeAlbumCaption(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized || null
}

export function normalizeCourseAlbumFetchLimit(value: string | null | undefined) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_COURSE_ALBUM_FETCH_LIMIT
  }

  return Math.min(Math.floor(parsed), MAX_COURSE_ALBUM_FETCH_LIMIT)
}

type AlbumExifSnapshot = {
  latitude?: number | null
  longitude?: number | null
  takenAt?: string | null
  make?: string | null
  model?: string | null
}

export function toAlbumExifJson(snapshot: AlbumExifSnapshot): Json | null {
  const payload = {
    latitude: typeof snapshot.latitude === 'number' ? snapshot.latitude : null,
    longitude: typeof snapshot.longitude === 'number' ? snapshot.longitude : null,
    takenAt: snapshot.takenAt?.trim() || null,
    make: snapshot.make?.trim() || null,
    model: snapshot.model?.trim() || null,
  }

  if (!payload.latitude && !payload.longitude && !payload.takenAt && !payload.make && !payload.model) {
    return null
  }

  return payload
}
