import { describe, expect, it } from 'vitest'
import {
  buildCourseAlbumPhotoPath,
  DEFAULT_COURSE_ALBUM_FETCH_LIMIT,
  extractCourseAlbumPhotoPath,
  MAX_COURSE_ALBUM_FETCH_LIMIT,
  normalizeCourseAlbumFetchLimit,
  resolveAlbumPhotoLocation,
  sanitizeAlbumPhotoBaseName,
  toAlbumExifJson,
} from '@/lib/course-album'

describe('course album helpers', () => {
  it('sanitizes file names for storage paths', () => {
    expect(sanitizeAlbumPhotoBaseName('my ride shot!!.jpg')).toBe('my_ride_shot_')
  })

  it('builds deterministic webp storage paths', () => {
    const path = buildCourseAlbumPhotoPath({
      userId: 'user-1',
      courseId: 'course-1',
      sourceFileName: 'ride photo.jpg',
      now: new Date('2026-03-08T05:00:00.000Z'),
    })

    expect(path).toBe('user-1/course-1/20260308050000_ride_photo.webp')
  })

  it('extracts public storage paths from course album urls', () => {
    expect(
      extractCourseAlbumPhotoPath(
        'https://example.supabase.co/storage/v1/object/public/course-album-photos/user-1/course-1/test.webp',
      ),
    ).toBe('user-1/course-1/test.webp')
  })

  it('prefers exif location and falls back to manual location', () => {
    expect(
      resolveAlbumPhotoLocation(
        { lat: 36.7, lng: 127.0 },
        { lat: 35.0, lng: 128.0 },
      ),
    ).toEqual({ lat: 36.7, lng: 127.0 })

    expect(
      resolveAlbumPhotoLocation(
        null,
        { lat: 35.0, lng: 128.0 },
      ),
    ).toEqual({ lat: 35.0, lng: 128.0 })
  })

  it('serializes compact exif snapshots', () => {
    expect(
      toAlbumExifJson({
        latitude: 36.7,
        longitude: 127.0,
        takenAt: '2026-03-08T05:00:00.000Z',
        make: 'Apple',
        model: 'iPhone',
      }),
    ).toEqual({
      latitude: 36.7,
      longitude: 127.0,
      takenAt: '2026-03-08T05:00:00.000Z',
      make: 'Apple',
      model: 'iPhone',
    })
  })

  it('normalizes album fetch limits', () => {
    expect(normalizeCourseAlbumFetchLimit(null)).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
    expect(normalizeCourseAlbumFetchLimit('abc')).toBe(DEFAULT_COURSE_ALBUM_FETCH_LIMIT)
    expect(normalizeCourseAlbumFetchLimit('999')).toBe(MAX_COURSE_ALBUM_FETCH_LIMIT)
    expect(normalizeCourseAlbumFetchLimit('24')).toBe(24)
  })
})
