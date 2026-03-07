import { describe, expect, it } from 'vitest'
import { extractPoiPhotoPath, getStalePoiPhotoPaths } from '@/lib/poi-photo-storage'

describe('extractPoiPhotoPath', () => {
  it('extracts the storage object path from a public poi photo url', () => {
    expect(
      extractPoiPhotoPath(
        'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/photo.jpg',
      ),
    ).toBe('user-1/course-1/photo.jpg')
  })

  it('returns null for non poi-photo urls', () => {
    expect(
      extractPoiPhotoPath(
        'https://example.supabase.co/storage/v1/object/public/gpx-files/user-1/file.gpx',
      ),
    ).toBeNull()
  })
})

describe('getStalePoiPhotoPaths', () => {
  it('returns deleted and replaced photo paths that are no longer referenced', () => {
    expect(
      getStalePoiPhotoPaths(
        [
          {
            id: 'poi-1',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/old-a.jpg',
          },
          {
            id: 'poi-2',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/old-b.jpg',
          },
        ],
        [
          {
            id: 'poi-1',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/new-a.jpg',
          },
        ],
      ),
    ).toEqual([
      'user-1/course-1/old-a.jpg',
      'user-1/course-1/old-b.jpg',
    ])
  })

  it('does not delete a photo that is still referenced by another final poi row', () => {
    expect(
      getStalePoiPhotoPaths(
        [
          {
            id: 'poi-1',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/shared.jpg',
          },
          {
            id: 'poi-2',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/old-b.jpg',
          },
        ],
        [
          {
            id: 'poi-2',
            photo_url: 'https://example.supabase.co/storage/v1/object/public/poi-photos/user-1/course-1/shared.jpg',
          },
        ],
      ),
    ).toEqual([
      'user-1/course-1/old-b.jpg',
    ])
  })
})
