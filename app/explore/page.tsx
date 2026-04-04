import type { Metadata } from 'next'
import { ExploreShell } from '@/components/explore/explore-shell'
import { buildCourseMetadata, fetchCourseSeoData } from '@/lib/course-seo'
import { loadExplorePageData } from '@/lib/explore-page-data'
import { getSiteUrl } from '@/lib/site-url'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const params = await searchParams
  const selectedCourseId = typeof params.courseId === 'string' ? params.courseId : null

  if (!selectedCourseId) {
    return {
      title: '코스 탐색 | Wheeling',
      description: '자전거 코스를 지도와 함께 탐색하세요.',
      alternates: {
        canonical: `${getSiteUrl()}/explore`,
      },
      robots: {
        index: false,
        follow: true,
      },
    }
  }

  const course = await fetchCourseSeoData(selectedCourseId)
  if (!course) {
    return {
      title: '코스 탐색 | Wheeling',
      robots: {
        index: false,
        follow: true,
      },
    }
  }

  return {
    ...buildCourseMetadata(course),
    robots: {
      index: false,
      follow: true,
    },
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const pageData = await loadExplorePageData({ params })

  return <ExploreShell {...pageData} />
}
