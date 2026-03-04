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
import { CourseListClient } from '@/components/courses/course-list-client'
import type { CourseListItem } from '@/types/course'

export function BottomSheet({ courses }: { courses: CourseListItem[] }) {
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
            <DrawerTitle>코스 목록</DrawerTitle>
            <DrawerDescription>
              아산시 자전거 코스를 탐색하세요
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <Suspense fallback={<CourseListSkeleton />}>
              <CourseListClient courses={courses} />
            </Suspense>
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
