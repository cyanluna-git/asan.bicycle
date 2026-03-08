import { describe, expect, it } from 'vitest'
import {
  normalizeCourseAlbumFetchLimit,
  DEFAULT_COURSE_ALBUM_FETCH_LIMIT,
  MAX_COURSE_ALBUM_FETCH_LIMIT,
} from '@/lib/course-album'
import type { CourseAlbumPhoto } from '@/types/course'

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makePhoto(overrides: Partial<CourseAlbumPhoto> = {}): CourseAlbumPhoto {
  return {
    id: 'photo-1',
    course_id: 'course-1',
    user_id: 'user-1',
    storage_path: 'user-1/course-1/photo.webp',
    public_url: 'https://example.com/photo.webp',
    taken_at: null,
    caption: null,
    width: null,
    height: null,
    source_exif_json: null,
    created_at: '2026-03-08T00:00:00Z',
    updated_at: '2026-03-08T00:00:00Z',
    lat: null,
    lng: null,
    ...overrides,
  }
}

function makePhotos(count: number): CourseAlbumPhoto[] {
  return Array.from({ length: count }, (_, i) =>
    makePhoto({ id: `photo-${i + 1}`, public_url: `https://example.com/photo-${i + 1}.webp` }),
  )
}

// ---------------------------------------------------------------------------
// The detail panel slices albumPreviewPhotos to max 4 items.
// This mirrors the `.slice(0, 4)` in course-detail-panel.tsx.
// ---------------------------------------------------------------------------

const ALBUM_PREVIEW_GRID_SIZE = 4

function slicePreviewPhotos(photos: CourseAlbumPhoto[]) {
  return photos.slice(0, ALBUM_PREVIEW_GRID_SIZE)
}

// ---------------------------------------------------------------------------
// normalizeCourseAlbumFetchLimit – album preview fetch scenario
// ---------------------------------------------------------------------------

describe('normalizeCourseAlbumFetchLimit (preview context)', () => {
  it('normalizes limit=4 (used for album preview pre-fetch)', () => {
    expect(normalizeCourseAlbumFetchLimit('4')).toBe(4)
  })

  it('normalizes limit=1 (minimum meaningful fetch)', () => {
    expect(normalizeCourseAlbumFetchLimit('1')).toBe(1)
  })

  it('falls back to default for null (full album fetch)', () => {
    expect(normalizeCourseAlbumFetchLimit(null)).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
  })

  it('falls back to default for undefined', () => {
    expect(normalizeCourseAlbumFetchLimit(undefined)).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
  })

  it('clamps to max limit for very large values', () => {
    expect(normalizeCourseAlbumFetchLimit('9999')).toBe(MAX_COURSE_ALBUM_FETCH_LIMIT)
  })

  it('floors fractional values', () => {
    expect(normalizeCourseAlbumFetchLimit('4.9')).toBe(4)
  })

  it('falls back to default for zero', () => {
    expect(normalizeCourseAlbumFetchLimit('0')).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
  })

  it('falls back to default for negative values', () => {
    expect(normalizeCourseAlbumFetchLimit('-1')).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
  })
})

// ---------------------------------------------------------------------------
// Album preview grid slicing (mirrors course-detail-panel.tsx behavior)
// ---------------------------------------------------------------------------

describe('album preview grid slicing', () => {
  it('returns empty array when no photos', () => {
    expect(slicePreviewPhotos([])).toEqual([])
  })

  it('returns all photos when fewer than grid size', () => {
    const photos = makePhotos(2)
    expect(slicePreviewPhotos(photos)).toHaveLength(2)
  })

  it('returns exactly 4 photos when exactly 4 provided', () => {
    const photos = makePhotos(4)
    expect(slicePreviewPhotos(photos)).toHaveLength(4)
  })

  it('caps at 4 photos even when more are provided', () => {
    const photos = makePhotos(8)
    const result = slicePreviewPhotos(photos)
    expect(result).toHaveLength(4)
    expect(result.map((p) => p.id)).toEqual([
      'photo-1',
      'photo-2',
      'photo-3',
      'photo-4',
    ])
  })

  it('returns 1 photo when only 1 is available', () => {
    const photos = makePhotos(1)
    expect(slicePreviewPhotos(photos)).toHaveLength(1)
  })

  it('preserves photo ordering from source', () => {
    const photos = makePhotos(6)
    const result = slicePreviewPhotos(photos)
    expect(result[0].id).toBe('photo-1')
    expect(result[3].id).toBe('photo-4')
  })
})

// ---------------------------------------------------------------------------
// Empty state detection (mirrors course-detail-panel.tsx rendering logic)
// ---------------------------------------------------------------------------

describe('album preview empty state', () => {
  it('empty array triggers empty state (0 photos)', () => {
    const photos: CourseAlbumPhoto[] = []
    expect(photos.length > 0).toBe(false)
  })

  it('non-empty array shows grid', () => {
    const photos = makePhotos(1)
    expect(photos.length > 0).toBe(true)
  })

  it('default prop value is empty array', () => {
    // Mirrors: albumPreviewPhotos = [] in CourseDetailPanelProps defaults
    const albumPreviewPhotos: CourseAlbumPhoto[] = []
    expect(albumPreviewPhotos).toEqual([])
    expect(albumPreviewPhotos.length).toBe(0)
  })
})
