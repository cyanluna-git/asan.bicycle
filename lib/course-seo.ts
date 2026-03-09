import type { Metadata } from 'next'
import { createAnonServerClient } from '@/lib/supabase-server'
import { getSiteUrl } from '@/lib/site-url'

type CourseSeoRow = {
  id: string
  title: string
  description: string | null
  difficulty: 'easy' | 'moderate' | 'hard'
  distance_km: number
  elevation_gain_m: number
  theme: string | null
  updated_at: string
}

type CourseSeoImageRow = {
  public_url: string
}

export type CourseSeoData = CourseSeoRow & {
  imageUrl: string | null
}

export function buildCourseSeoDescription(course: Pick<CourseSeoRow, 'description' | 'distance_km' | 'elevation_gain_m' | 'theme'>) {
  const normalized = course.description?.trim()
  if (normalized) {
    return normalized.slice(0, 140)
  }

  const parts = [
    `${course.distance_km}km`,
    `획득고도 ${course.elevation_gain_m.toLocaleString('ko-KR')}m`,
    course.theme?.trim() || null,
  ].filter(Boolean)

  return `아산 라이딩 코스 · ${parts.join(' · ')}`
}

export function buildCourseMetadata(course: CourseSeoData): Metadata {
  const siteUrl = getSiteUrl()
  const canonical = `${siteUrl}/courses/${course.id}`
  const description = buildCourseSeoDescription(course)
  const imageUrl = course.imageUrl ?? `${siteUrl}/opengraph-image`

  return {
    title: `${course.title} | asan.bicycle`,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'article',
      locale: 'ko_KR',
      url: canonical,
      title: course.title,
      description,
      siteName: 'asan.bicycle',
      images: [
        {
          url: imageUrl,
          alt: `${course.title} 코스 미리보기`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: course.title,
      description,
      images: [imageUrl],
    },
  }
}

export async function fetchCourseSeoData(courseId: string): Promise<CourseSeoData | null> {
  const supabase = createAnonServerClient()

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, description, difficulty, distance_km, elevation_gain_m, theme, updated_at')
    .eq('id', courseId)
    .maybeSingle()

  if (!course) {
    return null
  }

  const { data: albumPhoto } = await supabase
    .from('course_album_photos')
    .select('public_url')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    ...(course as CourseSeoRow),
    imageUrl: ((albumPhoto as CourseSeoImageRow | null)?.public_url ?? null),
  }
}

export async function fetchCourseSitemapEntries() {
  const supabase = createAnonServerClient()
  const { data } = await supabase
    .from('courses')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })

  return (data ?? []) as Array<{ id: string; updated_at: string }>
}
