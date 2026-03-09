import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type {
  CourseAlbumPhoto,
  CourseDetail,
  CourseReview,
  UphillSegment,
  PoiMapItem,
} from '@/types/course'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/explore',
  useSearchParams: () => ({
    get: () => null,
    toString: () => '',
  }),
}))

vi.mock('next/image', async () => {
  const ReactModule = await import('react')
  return {
    default: (input: Record<string, unknown>) => {
      const { src, alt, ...props } = input
      delete props.fill
      delete props.unoptimized
      return ReactModule.createElement('img', {
        src,
        alt,
        ...props,
      })
    },
  }
})

vi.mock('next/link', async () => {
  const ReactModule = await import('react')
  return {
    default: ({
      href,
      children,
      ...props
    }: {
      href: string
      children: React.ReactNode
    }) =>
      ReactModule.createElement('a', { href, ...props }, children),
  }
})

vi.mock('@/lib/auth', () => ({
  signInWithGoogle: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(),
  },
}))

vi.mock('@/lib/course-album-upload', () => ({
  uploadCourseAlbumPhoto: vi.fn(),
}))

import { CourseDetailPanel } from '@/components/courses/course-detail-panel'

function makeCourse(overrides: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: 'course-1',
    title: '신정호 라이딩',
    description: '모바일 상세 패널 레이아웃 검증용 코스 설명입니다.',
    difficulty: 'moderate',
    distance_km: 42.1,
    elevation_gain_m: 520,
    gpx_url: 'https://example.com/course-1.gpx',
    theme: '호수',
    tags: ['경치', '카페'],
    uploader_name: '아산라이더',
    uploader_emoji: '🚴',
    created_by: 'user-1',
    start_point_id: 'start-1',
    route_geojson: null,
    ...overrides,
  }
}

function makeReview(overrides: Partial<CourseReview> = {}): CourseReview {
  return {
    id: 'review-1',
    course_id: 'course-1',
    user_id: 'user-2',
    rating: 4,
    content: '모바일에서도 보기 편한 코스예요.',
    ridden_at: null,
    perceived_difficulty: null,
    condition_note: null,
    created_at: '2026-03-09T00:00:00Z',
    updated_at: '2026-03-09T00:00:00Z',
    author_name: '홍길동',
    author_emoji: '🚴',
    ...overrides,
  }
}

function makePoi(overrides: Partial<PoiMapItem> = {}): PoiMapItem {
  return {
    id: 'poi-1',
    course_id: 'course-1',
    name: '카페 신정호',
    category: 'cafe',
    description: '잠깐 쉬어가기 좋은 카페',
    photo_url: null,
    lat: 36.77,
    lng: 127.0,
    ...overrides,
  }
}

function makeAlbumPhoto(overrides: Partial<CourseAlbumPhoto> = {}): CourseAlbumPhoto {
  return {
    id: 'photo-1',
    course_id: 'course-1',
    user_id: 'user-1',
    storage_path: 'user-1/course-1/photo.webp',
    public_url: 'https://example.com/photo.webp',
    taken_at: null,
    caption: '호수 풍경',
    width: 1200,
    height: 900,
    source_exif_json: null,
    created_at: '2026-03-09T00:00:00Z',
    updated_at: '2026-03-09T00:00:00Z',
    lat: 36.77,
    lng: 127.0,
    ...overrides,
  }
}

function makeUphillSegment(overrides: Partial<UphillSegment> = {}): UphillSegment {
  return {
    id: 'uphill-1',
    course_id: 'course-1',
    name: '예당호 업힐',
    start_km: 0,
    end_km: 0.27,
    created_at: '2026-03-09T00:00:00Z',
    ...overrides,
  }
}

function renderPanel(props: Partial<React.ComponentProps<typeof CourseDetailPanel>> = {}) {
  const markup = renderToStaticMarkup(
    React.createElement(CourseDetailPanel, {
      course: makeCourse(),
      pois: [makePoi()],
      selectedPoiId: null,
      uphillSegments: [],
      canEditCourse: true,
      reviews: [makeReview(), makeReview({ id: 'review-2', user_id: 'user-3' })],
      reviewStats: { review_count: 2, avg_rating: 4 },
      albumPreviewPhotos: [makeAlbumPhoto()],
      user: null,
      onOpenReviews: vi.fn(),
      onOpenAlbum: vi.fn(),
      ...props,
    }),
  )

  return {
    markup,
    document: new DOMParser().parseFromString(markup, 'text/html'),
  }
}

describe('CourseDetailPanel mobile layout', () => {
  it('renders mobile-first CTA structure for reviews, album, POI, and GPX download', () => {
    const { markup, document } = renderPanel()

    expect(document.body.textContent).toContain('2개 후기')
    expect(document.body.textContent).toContain('후기 쓰기')
    expect(document.body.textContent).toContain('앨범 보기')
    expect(document.body.textContent).toContain('사진 추가')
    expect(document.body.textContent).toContain('들를만한 곳')
    expect(document.body.textContent).toContain('카카오 공유')
    expect(markup).toContain('h-10 w-full rounded-full sm:h-9 sm:w-auto sm:shrink-0')
    expect(markup).toContain('px-3.5 py-2 text-sm')
    expect(markup).toContain('w-[17rem]')

    const downloadLink = Array.from(document.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.includes('GPX 다운로드'),
    )
    expect(downloadLink?.getAttribute('href')).toBe('/api/courses/course-1/download')
    expect(downloadLink?.className).toContain('h-11')
    expect(downloadLink?.className).toContain('w-full')
  })

  it('keeps empty states visible when reviews, album photos, and POIs are missing', () => {
    const { document } = renderPanel({
      course: makeCourse({ gpx_url: null }),
      pois: [],
      reviews: [],
      reviewStats: { review_count: 0, avg_rating: null },
      albumPreviewPhotos: [],
    })

    expect(document.body.textContent).toContain('아직 첫 후기 전입니다.')
    expect(document.body.textContent).toContain('아직 등록된 사진이 없습니다.')
    expect(document.body.textContent).toContain('등록된 POI가 없습니다.')

    const downloadLink = Array.from(document.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.includes('GPX 다운로드'),
    )
    expect(downloadLink).toBeUndefined()
  })

  it('hides the ownership panel when the viewer cannot edit the course', () => {
    const { document } = renderPanel({
      canEditCourse: false,
      user: {
        id: 'user-2',
      } as never,
    })

    expect(document.body.textContent).not.toContain('수정 불가')
    expect(document.body.textContent).not.toContain('권한 확인됨')
  })

  it('does not render the ownership panel even when the viewer can edit the course', () => {
    const { document } = renderPanel({
      canEditCourse: true,
      user: {
        id: 'user-1',
      } as never,
    })

    expect(document.body.textContent).not.toContain('내 코스')
    expect(document.body.textContent).not.toContain('수정 가능')
    expect(document.body.textContent).not.toContain('권한 확인됨')
  })

  it('shows uphill gradient metrics when route and uphill segments are available', () => {
    const { document } = renderPanel({
      course: makeCourse({
        route_geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [
                  [127.0, 36.0, 100],
                  [127.001, 36.0, 110],
                  [127.002, 36.0, 120],
                  [127.003, 36.0, 126],
                ],
              },
            },
          ],
        },
      }),
      uphillSegments: [makeUphillSegment()],
    })

    expect(document.body.textContent).toContain('예당호 업힐')
    expect(document.body.textContent).toContain('평균 경사도 9.6%')
    expect(document.body.textContent).toContain('상승 26m')
    expect(document.body.textContent).toContain('길이 0.27km')
  })
})
