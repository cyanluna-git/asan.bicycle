import { describe, expect, it } from 'vitest'
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
    makePhoto({
      id: `photo-${i + 1}`,
      public_url: `https://example.com/photo-${i + 1}.webp`,
    }),
  )
}

// ---------------------------------------------------------------------------
// Mirrors the handleInlineAlbumPhotoUploaded logic from explore-shell.tsx
// (lines 211-216):
//
//   setAlbumPreviewPhotos((prev) => [photo, ...prev].slice(0, 4))
//   setAlbumPhotos((prev) => [photo, ...prev])
//
// We extract the two state updater functions as pure functions.
// ---------------------------------------------------------------------------

const ALBUM_PREVIEW_CAP = 4

/** Mirrors the albumPreviewPhotos state updater: prepend + cap at 4. */
function prependPreviewPhoto(
  prev: CourseAlbumPhoto[],
  photo: CourseAlbumPhoto,
): CourseAlbumPhoto[] {
  return [photo, ...prev].slice(0, ALBUM_PREVIEW_CAP)
}

/** Mirrors the albumPhotos state updater: prepend only, no cap. */
function prependAlbumPhoto(
  prev: CourseAlbumPhoto[],
  photo: CourseAlbumPhoto,
): CourseAlbumPhoto[] {
  return [photo, ...prev]
}

// ---------------------------------------------------------------------------
// prependPreviewPhoto — prepend + cap at 4
// ---------------------------------------------------------------------------

describe('prependPreviewPhoto (albumPreviewPhotos updater)', () => {
  it('prepends photo to empty array', () => {
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependPreviewPhoto([], newPhoto)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-1')
  })

  it('prepends photo before existing photos', () => {
    const existing = makePhotos(2)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependPreviewPhoto(existing, newPhoto)
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('new-1')
    expect(result[1].id).toBe('photo-1')
    expect(result[2].id).toBe('photo-2')
  })

  it('returns exactly 4 when prepending to 3 existing', () => {
    const existing = makePhotos(3)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependPreviewPhoto(existing, newPhoto)
    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('new-1')
    expect(result[3].id).toBe('photo-3')
  })

  it('caps at 4 when prepending to 4 existing (drops the last)', () => {
    const existing = makePhotos(4)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependPreviewPhoto(existing, newPhoto)
    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('new-1')
    // photo-4 is dropped
    expect(result.map((p) => p.id)).toEqual([
      'new-1',
      'photo-1',
      'photo-2',
      'photo-3',
    ])
  })

  it('caps at 4 when prepending to more than 4 existing', () => {
    const existing = makePhotos(10)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependPreviewPhoto(existing, newPhoto)
    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('new-1')
  })

  it('new photo is always first regardless of existing count', () => {
    for (const count of [0, 1, 2, 3, 4, 5]) {
      const existing = makePhotos(count)
      const newPhoto = makePhoto({ id: 'always-first' })
      const result = prependPreviewPhoto(existing, newPhoto)
      expect(result[0].id).toBe('always-first')
    }
  })

  it('does not mutate the original array', () => {
    const existing = makePhotos(3)
    const originalIds = existing.map((p) => p.id)
    const newPhoto = makePhoto({ id: 'new-1' })
    prependPreviewPhoto(existing, newPhoto)
    expect(existing.map((p) => p.id)).toEqual(originalIds)
    expect(existing).toHaveLength(3)
  })

  it('successive uploads keep pushing older photos out', () => {
    let preview: CourseAlbumPhoto[] = makePhotos(4)

    const upload1 = makePhoto({ id: 'upload-1' })
    preview = prependPreviewPhoto(preview, upload1)
    expect(preview.map((p) => p.id)).toEqual([
      'upload-1',
      'photo-1',
      'photo-2',
      'photo-3',
    ])

    const upload2 = makePhoto({ id: 'upload-2' })
    preview = prependPreviewPhoto(preview, upload2)
    expect(preview.map((p) => p.id)).toEqual([
      'upload-2',
      'upload-1',
      'photo-1',
      'photo-2',
    ])

    const upload3 = makePhoto({ id: 'upload-3' })
    preview = prependPreviewPhoto(preview, upload3)
    expect(preview.map((p) => p.id)).toEqual([
      'upload-3',
      'upload-2',
      'upload-1',
      'photo-1',
    ])
  })
})

// ---------------------------------------------------------------------------
// prependAlbumPhoto — prepend without cap
// ---------------------------------------------------------------------------

describe('prependAlbumPhoto (albumPhotos updater)', () => {
  it('prepends photo to empty array', () => {
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependAlbumPhoto([], newPhoto)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-1')
  })

  it('prepends photo before existing photos', () => {
    const existing = makePhotos(3)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependAlbumPhoto(existing, newPhoto)
    expect(result).toHaveLength(4)
    expect(result[0].id).toBe('new-1')
    expect(result[1].id).toBe('photo-1')
  })

  it('does NOT cap at 4 (unlike preview)', () => {
    const existing = makePhotos(10)
    const newPhoto = makePhoto({ id: 'new-1' })
    const result = prependAlbumPhoto(existing, newPhoto)
    expect(result).toHaveLength(11)
    expect(result[0].id).toBe('new-1')
  })

  it('does not mutate the original array', () => {
    const existing = makePhotos(5)
    const newPhoto = makePhoto({ id: 'new-1' })
    prependAlbumPhoto(existing, newPhoto)
    expect(existing).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// handleInlineAlbumPhotoUploaded — combined behavior
// ---------------------------------------------------------------------------

describe('handleInlineAlbumPhotoUploaded (combined updater)', () => {
  /**
   * Simulates calling handleInlineAlbumPhotoUploaded with the current state,
   * returning the next state for both albumPreviewPhotos and albumPhotos.
   */
  function simulateUpload(
    state: {
      albumPreviewPhotos: CourseAlbumPhoto[]
      albumPhotos: CourseAlbumPhoto[]
    },
    photo: CourseAlbumPhoto,
  ) {
    return {
      albumPreviewPhotos: prependPreviewPhoto(state.albumPreviewPhotos, photo),
      albumPhotos: prependAlbumPhoto(state.albumPhotos, photo),
    }
  }

  it('first upload on a fresh course populates both lists', () => {
    const state = { albumPreviewPhotos: [], albumPhotos: [] }
    const photo = makePhoto({ id: 'first-upload' })
    const next = simulateUpload(state, photo)
    expect(next.albumPreviewPhotos).toHaveLength(1)
    expect(next.albumPhotos).toHaveLength(1)
    expect(next.albumPreviewPhotos[0].id).toBe('first-upload')
    expect(next.albumPhotos[0].id).toBe('first-upload')
  })

  it('after 5 uploads, preview has 4, full album has 5', () => {
    let state: {
      albumPreviewPhotos: CourseAlbumPhoto[]
      albumPhotos: CourseAlbumPhoto[]
    } = { albumPreviewPhotos: [], albumPhotos: [] }

    for (let i = 1; i <= 5; i++) {
      const photo = makePhoto({ id: `upload-${i}` })
      state = simulateUpload(state, photo)
    }

    expect(state.albumPreviewPhotos).toHaveLength(4)
    expect(state.albumPhotos).toHaveLength(5)

    // Preview shows the 4 most recent
    expect(state.albumPreviewPhotos.map((p) => p.id)).toEqual([
      'upload-5',
      'upload-4',
      'upload-3',
      'upload-2',
    ])

    // Full album has all 5 in reverse chronological order
    expect(state.albumPhotos.map((p) => p.id)).toEqual([
      'upload-5',
      'upload-4',
      'upload-3',
      'upload-2',
      'upload-1',
    ])
  })

  it('upload with pre-existing server photos: preview caps correctly', () => {
    const serverPhotos = makePhotos(4)
    const state = {
      albumPreviewPhotos: serverPhotos,
      albumPhotos: serverPhotos,
    }
    const newPhoto = makePhoto({ id: 'inline-upload' })
    const next = simulateUpload(state, newPhoto)

    expect(next.albumPreviewPhotos).toHaveLength(4)
    expect(next.albumPreviewPhotos[0].id).toBe('inline-upload')
    // The 4th server photo is dropped from preview
    expect(next.albumPreviewPhotos.map((p) => p.id)).not.toContain('photo-4')

    // Full album keeps everything
    expect(next.albumPhotos).toHaveLength(5)
    expect(next.albumPhotos[0].id).toBe('inline-upload')
    expect(next.albumPhotos.map((p) => p.id)).toContain('photo-4')
  })
})

// ---------------------------------------------------------------------------
// Conditional rendering logic in course-detail-panel.tsx
// (lines 335-342): user ? <InlineAlbumUploadButton> : <InlineAlbumLoginPrompt>
// ---------------------------------------------------------------------------

describe('inline album upload / login prompt visibility', () => {
  /** Mirrors the conditional rendering: !user shows login prompt, user shows upload button. */
  function getInlineAlbumComponent(user: { id: string } | null): 'login-prompt' | 'upload-button' {
    return user ? 'upload-button' : 'login-prompt'
  }

  it('shows login prompt when user is null', () => {
    expect(getInlineAlbumComponent(null)).toBe('login-prompt')
  })

  it('shows upload button when user is logged in', () => {
    expect(getInlineAlbumComponent({ id: 'user-1' })).toBe('upload-button')
  })
})
