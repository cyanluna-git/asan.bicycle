import { CourseEditPageClient } from '@/components/courses/course-edit-page-client'

export default async function CourseEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <CourseEditPageClient courseId={id} />
}
