import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExploreShell } from '@/components/explore/explore-shell'
import { buildCourseMetadata, fetchCourseSeoData } from '@/lib/course-seo'
import { loadExplorePageData } from '@/lib/explore-page-data'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const course = await fetchCourseSeoData(id)

  if (!course) {
    return {
      title: '코스를 찾을 수 없음 | asan.bicycle',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  return buildCourseMetadata(course)
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pageData = await loadExplorePageData({
    params: {},
    selectedCourseIdOverride: id,
  })

  if (!pageData.selectedCourse) {
    notFound()
  }

  return <ExploreShell {...pageData} />
}
