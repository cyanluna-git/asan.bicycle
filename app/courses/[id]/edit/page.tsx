import type { Metadata } from 'next'
import { CourseEditPageClient } from '@/components/courses/course-edit-page-client'

export const metadata: Metadata = {
  title: '코스 수정 | asan.bicycle',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function CourseEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <CourseEditPageClient courseId={id} />
}
