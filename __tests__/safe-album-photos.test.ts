import { describe, expect, it } from 'vitest'
import { filterSafeAlbumPhotos } from '@/lib/course-album'
import type { CourseAlbumPhoto } from '@/types/course'

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

describe('filterSafeAlbumPhotos', () => {
  const matchingPhotos = [
    makePhoto({ id: 'p1', course_id: 'course-1' }),
    makePhoto({ id: 'p2', course_id: 'course-1' }),
  ]

  it('returns photos when all conditions are met', () => {
    const result = filterSafeAlbumPhotos({
      activeSurfaceKind: 'album',
      albumPhotos: matchingPhotos,
      selectedCourseId: 'course-1',
    })

    expect(result).toBe(matchingPhotos)
    expect(result).toHaveLength(2)
  })

  it('returns [] when activeSurfaceKind is not "album"', () => {
    expect(
      filterSafeAlbumPhotos({
        activeSurfaceKind: 'review',
        albumPhotos: matchingPhotos,
        selectedCourseId: 'course-1',
      }),
    ).toEqual([])
  })

  it('returns [] when activeSurfaceKind is null', () => {
    expect(
      filterSafeAlbumPhotos({
        activeSurfaceKind: null,
        albumPhotos: matchingPhotos,
        selectedCourseId: 'course-1',
      }),
    ).toEqual([])
  })

  it('returns [] when albumPhotos is empty', () => {
    expect(
      filterSafeAlbumPhotos({
        activeSurfaceKind: 'album',
        albumPhotos: [],
        selectedCourseId: 'course-1',
      }),
    ).toEqual([])
  })

  it('returns [] when course_id does not match selectedCourseId (stale state)', () => {
    const stalePhotos = [
      makePhoto({ id: 'p1', course_id: 'old-course' }),
      makePhoto({ id: 'p2', course_id: 'old-course' }),
    ]

    expect(
      filterSafeAlbumPhotos({
        activeSurfaceKind: 'album',
        albumPhotos: stalePhotos,
        selectedCourseId: 'new-course',
      }),
    ).toEqual([])
  })

  it('returns [] when selectedCourseId is null', () => {
    expect(
      filterSafeAlbumPhotos({
        activeSurfaceKind: 'album',
        albumPhotos: matchingPhotos,
        selectedCourseId: null,
      }),
    ).toEqual([])
  })

  it('uses only the first photo course_id for the match check', () => {
    const mixedPhotos = [
      makePhoto({ id: 'p1', course_id: 'course-1' }),
      makePhoto({ id: 'p2', course_id: 'course-2' }),
    ]

    // First photo matches => returns all photos (guard only checks [0])
    const result = filterSafeAlbumPhotos({
      activeSurfaceKind: 'album',
      albumPhotos: mixedPhotos,
      selectedCourseId: 'course-1',
    })

    expect(result).toBe(mixedPhotos)
  })
})
