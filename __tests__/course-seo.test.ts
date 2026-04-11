import { afterEach, describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import {
  buildCourseMetadata,
  buildCourseSeoDescription,
  type CourseSeoData,
} from '@/lib/course-seo'
import { getSiteUrl } from '@/lib/site-url'

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL
const originalVercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
const originalVercelUrl = process.env.VERCEL_URL

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

afterEach(() => {
  restoreEnv('NEXT_PUBLIC_APP_URL', originalAppUrl)
  restoreEnv('VERCEL_PROJECT_PRODUCTION_URL', originalVercelProductionUrl)
  restoreEnv('VERCEL_URL', originalVercelUrl)
})

describe('getSiteUrl', () => {
  it('uses the public app url without a trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://asan.bicycle/'

    expect(getSiteUrl()).toBe('https://asan.bicycle')
  })

  it('falls back to the Vercel production url when the public app url is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'gulrim.com/'
    delete process.env.VERCEL_URL

    expect(getSiteUrl()).toBe('https://gulrim.com')
  })

  it('falls back to the default site url when no env is configured', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    delete process.env.VERCEL_URL

    expect(getSiteUrl()).toBe('https://www.gulrim.com')
  })
})

describe('buildCourseSeoDescription', () => {
  it('uses the trimmed course description when available', () => {
    expect(
      buildCourseSeoDescription({
        description: '  예당호 주변을 도는 경치 좋은 코스입니다.  ',
        distance_km: 80,
        elevation_gain_m: 455,
        theme: '호수',
      }),
    ).toBe('예당호 주변을 도는 경치 좋은 코스입니다.')
  })

  it('falls back to key ride metrics when the description is empty', () => {
    expect(
      buildCourseSeoDescription({
        description: null,
        distance_km: 80,
        elevation_gain_m: 1455,
        theme: '호수',
      }),
    ).toBe('라이딩 코스 · 80km · 획득고도 1,455m · 호수')
  })
})

describe('buildCourseMetadata', () => {
  const course: CourseSeoData = {
    id: 'course-123',
    title: '좌부-예당호-도고-송악',
    description: null,
    difficulty: 'moderate',
    distance_km: 80,
    elevation_gain_m: 455,
    theme: '호수',
    updated_at: '2026-03-09T00:00:00.000Z',
    imageUrl: 'https://cdn.example.com/album-preview.jpg',
  }

  it('builds canonical metadata for the course detail page', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://asan.bicycle'

    const metadata = buildCourseMetadata(course)

    expect(metadata.title).toBe('좌부-예당호-도고-송악 | 굴림')
    expect(metadata.description).toBe('라이딩 코스 · 80km · 획득고도 455m · 호수')
    expect(metadata.alternates?.canonical).toBe('https://asan.bicycle/courses/course-123')
    expect(metadata.openGraph?.url).toBe('https://asan.bicycle/courses/course-123')
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://cdn.example.com/album-preview.jpg',
        alt: '좌부-예당호-도고-송악 코스 미리보기',
      },
    ])
  })

  it('falls back to the shared og image when the course has no album preview', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://asan.bicycle'

    const metadata = buildCourseMetadata({
      ...course,
      imageUrl: null,
    })

    expect(metadata.twitter?.images).toEqual(['https://asan.bicycle/opengraph-image?v=20260411'])
  })
})

describe('robots', () => {
  it('disallows non-indexable surfaces while allowing canonical course pages', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://asan.bicycle'

    expect(robots()).toEqual({
      rules: [
        {
          userAgent: '*',
          allow: ['/', '/courses', '/courses/', '/courses/*'],
          disallow: ['/api/', '/explore', '/upload', '/my-courses', '/courses/*/edit'],
        },
      ],
      sitemap: 'https://asan.bicycle/sitemap.xml',
      host: 'https://asan.bicycle',
    })
  })
})
