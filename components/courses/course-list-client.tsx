'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { CourseCard } from '@/components/courses/course-card'
import type { CourseListItem } from '@/types/course'

function EmptyState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  if (hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          조건에 맞는 코스가 없습니다.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          필터를 변경하거나 초기화해 보세요.
        </p>
      </div>
    )
  }

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

interface CourseListClientProps {
  courses: CourseListItem[]
  hasActiveFilters?: boolean
}

export function CourseListClient({
  courses,
  hasActiveFilters = false,
}: CourseListClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedId = searchParams.get('courseId')

  const handleSelect = (id: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (id === selectedId) {
      params.delete('courseId')
    } else {
      params.set('courseId', id)
    }
    const qs = params.toString()
    router.push(qs ? `?${qs}` : '/', { scroll: false })
  }

  if (courses.length === 0) {
    return <EmptyState hasActiveFilters={hasActiveFilters} />
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
