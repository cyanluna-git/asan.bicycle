import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { CourseListClient } from '@/components/courses/course-list-client'
import type { CourseListItem } from '@/types/course'

export function Sidebar({ courses }: { courses: CourseListItem[] }) {
  return (
    <aside className="hidden md:flex flex-col w-[280px] border-r bg-background">
      <div className="overflow-y-auto h-full p-4">
        {/* Filter section */}
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-foreground">필터</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground">출발 기점</label>
              <div className="mt-1 h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                전체
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">난이도</label>
              <div className="mt-1 flex gap-1.5">
                <Badge variant="secondary">초급</Badge>
                <Badge variant="default">중급</Badge>
                <Badge variant="destructive">상급</Badge>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">거리</label>
              <div className="mt-1 h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm text-muted-foreground">
                전체
              </div>
            </div>
          </div>
        </div>

        {/* Course list */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            코스 목록
          </h2>
          <Suspense fallback={<CourseListSkeleton />}>
            <CourseListClient courses={courses} />
          </Suspense>
        </div>
      </div>
    </aside>
  )
}

function CourseListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-lg border bg-muted/50 animate-pulse" />
      ))}
    </div>
  )
}
