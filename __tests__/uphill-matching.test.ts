import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { CourseDetail, FamousUphill } from '@/types/course'

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
      return ReactModule.createElement('img', { src, alt, ...props })
    },
  }
})

vi.mock('next/link', async () => {
  const ReactModule = await import('react')
  return {
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
      ReactModule.createElement('a', { href, ...props }, children),
  }
})

vi.mock('@/lib/auth', () => ({ signInWithGoogle: vi.fn() }))
vi.mock('react-kakao-maps-sdk', () => ({ useKakaoLoader: () => [false, null] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
}))
vi.mock('@/lib/course-album-upload', () => ({ uploadCourseAlbumPhoto: vi.fn() }))

import { CourseDetailPanel } from '@/components/courses/course-detail-panel'

function makeCourse(overrides: Partial<CourseDetail> = {}): CourseDetail {
  return {
    id: 'course-1',
    title: '테스트 코스',
    description: null,
    difficulty: 'moderate',
    distance_km: 50,
    elevation_gain_m: 800,
    gpx_url: null,
    theme: null,
    tags: [],
    uploader_name: null,
    created_by: null,
    start_point_id: null,
    route_preview_points: null,
    ...overrides,
  }
}

function makeUphill(overrides: Partial<FamousUphill> = {}): FamousUphill {
  return {
    id: 'uphill-1',
    name: '광덕고개',
    avg_grade: 6.5,
    climb_category: 3,
    distance_m: 5200,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. FamousUphill type shape
// ---------------------------------------------------------------------------

describe('FamousUphill type shape', () => {
  it('satisfies required fields', () => {
    const uphill: FamousUphill = makeUphill()
    expect(uphill).toHaveProperty('id')
    expect(uphill).toHaveProperty('name')
    expect(uphill).toHaveProperty('avg_grade')
    expect(uphill).toHaveProperty('climb_category')
    expect(uphill).toHaveProperty('distance_m')
  })

  it('allows null for nullable fields', () => {
    const uphill: FamousUphill = makeUphill({
      avg_grade: null,
      climb_category: null,
      distance_m: null,
    })
    expect(uphill.avg_grade).toBeNull()
    expect(uphill.climb_category).toBeNull()
    expect(uphill.distance_m).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. CourseDetailPanel — 유명 업힐 section visibility
// ---------------------------------------------------------------------------

describe('CourseDetailPanel — famous uphills section', () => {
  it('does not render 유명 업힐 section when famousUphills is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(CourseDetailPanel, {
        course: makeCourse(),
        famousUphills: [],
      }),
    )
    expect(html).not.toContain('유명 업힐')
  })

  it('renders 유명 업힐 section heading when at least one uphill is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(CourseDetailPanel, {
        course: makeCourse(),
        famousUphills: [makeUphill()],
      }),
    )
    expect(html).toContain('유명 업힐')
  })

  it('renders the uphill name', () => {
    const html = renderToStaticMarkup(
      React.createElement(CourseDetailPanel, {
        course: makeCourse(),
        famousUphills: [makeUphill({ name: '광덕고개' })],
      }),
    )
    expect(html).toContain('광덕고개')
  })

  it('renders avg_grade when non-null', () => {
    const html = renderToStaticMarkup(
      React.createElement(CourseDetailPanel, {
        course: makeCourse(),
        famousUphills: [makeUphill({ avg_grade: 7.3 })],
      }),
    )
    expect(html).toContain('7.3%')
  })

  it('does not render avg_grade when null', () => {
    const html = renderToStaticMarkup(
      React.createElement(CourseDetailPanel, {
        course: makeCourse(),
        famousUphills: [makeUphill({ avg_grade: null, name: '노을고개' })],
      }),
    )
    // avg_grade line should not appear
    expect(html).not.toContain('평균 경사도')
  })
})

// ---------------------------------------------------------------------------
// 3. climb_category badge rendering
// ---------------------------------------------------------------------------

describe('CourseDetailPanel — climb_category badges', () => {
  const cases: Array<[number | null, string | null]> = [
    [5, 'HC'],
    [4, 'Cat1'],
    [3, 'Cat2'],
    [2, 'Cat3'],
    [1, 'Cat4'],
    [0, null],
    [null, null],
  ]

  for (const [category, expectedLabel] of cases) {
    it(`climb_category=${category} → badge="${expectedLabel ?? 'hidden'}"`, () => {
      const html = renderToStaticMarkup(
        React.createElement(CourseDetailPanel, {
          course: makeCourse(),
          famousUphills: [makeUphill({ climb_category: category })],
        }),
      )
      if (expectedLabel) {
        expect(html).toContain(expectedLabel)
      } else {
        // None of the badge labels should be present when category is 0 or null
        for (const label of ['HC', 'Cat1', 'Cat2', 'Cat3', 'Cat4']) {
          expect(html).not.toContain(label)
        }
      }
    })
  }
})
