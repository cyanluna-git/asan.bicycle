'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { CourseCard } from '@/components/courses/course-card'
import type { CourseListItem } from '@/types/course'

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">
        등록된 코스가 없습니다.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        새로운 코스를 등록해 보세요!
      </p>
    </div>
  )
}

export function CourseListClient({ courses }: { courses: CourseListItem[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('courseId')

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('courseId', id)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  if (courses.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col gap-2">
      {courses.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          isSelected={selectedId === course.id}
          onClick={() => handleSelect(course.id)}
        />
      ))}
    </div>
  )
}
