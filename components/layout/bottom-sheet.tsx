'use client'

import { Suspense } from 'react'
import { List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { CourseFilter } from '@/components/filter/course-filter'
import { CourseListClient } from '@/components/courses/course-list-client'
import { CourseDetailPanel } from '@/components/courses/course-detail-panel'
import type { CourseListItem, CourseDetail, PoiMapItem, UphillSegment } from '@/types/course'

interface BottomSheetProps {
  courses: CourseListItem[]
  startPoints: { id: string; name: string }[]
  themes: string[]
  hasActiveFilters: boolean
  selectedCourse?: CourseDetail | null
  pois?: PoiMapItem[]
  uphillSegments?: UphillSegment[]
}

export function BottomSheet({
  courses,
  startPoints,
  themes,
  hasActiveFilters,
  selectedCourse,
  pois,
  uphillSegments,
}: BottomSheetProps) {
  return (
    <div className="md:hidden">
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 shadow-lg"
            size="lg"
          >
            <List />
            코스 목록 보기
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {selectedCourse ? selectedCourse.title : '코스 목록'}
            </DrawerTitle>
            <DrawerDescription>
              {selectedCourse
                ? '코스 상세 정보'
                : '아산시 자전거 코스를 탐색하세요'}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {selectedCourse ? (
              <CourseDetailPanel course={selectedCourse} pois={pois ?? []} uphillSegments={uphillSegments ?? []} />
            ) : (
              <>
                {/* Filter section */}
                <Suspense fallback={null}>
                  <CourseFilter startPoints={startPoints} themes={themes} />
                </Suspense>

                {/* Course list */}
                <Suspense fallback={<CourseListSkeleton />}>
                  <CourseListClient
                    courses={courses}
                    hasActiveFilters={hasActiveFilters}
                  />
                </Suspense>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
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
