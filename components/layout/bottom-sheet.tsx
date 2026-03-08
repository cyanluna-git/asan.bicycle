'use client'

import { Suspense, useEffect, useState } from 'react'
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
import type {
  CourseAlbumPhoto,
  CourseListItem,
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface BottomSheetProps {
  courses: CourseListItem[]
  startPoints: { id: string; name: string }[]
  themes: string[]
  hasActiveFilters: boolean
  selectedCourse?: CourseDetail | null
  pois?: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
  uphillSegments?: UphillSegment[]
  canEditSelectedCourse?: boolean
  reviews?: CourseReview[]
  reviewStats?: CourseReviewStats | null
  albumPreviewPhotos?: CourseAlbumPhoto[]
  user?: User | null
  onOpenReviews?: (triggerEl?: HTMLButtonElement | null) => void
  onOpenAlbum?: (triggerEl?: HTMLButtonElement | null) => void
  onAlbumPhotoUploaded?: (photo: CourseAlbumPhoto) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BottomSheet({
  courses,
  startPoints,
  themes,
  hasActiveFilters,
  selectedCourse,
  pois,
  selectedPoiId,
  onSelectPoi,
  uphillSegments,
  canEditSelectedCourse = false,
  reviews,
  reviewStats,
  albumPreviewPhotos,
  user,
  onOpenReviews,
  onOpenAlbum,
  onAlbumPhotoUploaded,
  open,
  onOpenChange,
}: BottomSheetProps) {
  const [pendingSurfaceOpen, setPendingSurfaceOpen] = useState<'review' | 'album' | null>(null)
  const [pendingTrigger, setPendingTrigger] = useState<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (open || !pendingSurfaceOpen) {
      return
    }

    if (pendingSurfaceOpen === 'review') {
      onOpenReviews?.(pendingTrigger)
    } else {
      onOpenAlbum?.(pendingTrigger)
    }

    setPendingSurfaceOpen(null)
    setPendingTrigger(null)
  }, [onOpenAlbum, onOpenReviews, open, pendingSurfaceOpen, pendingTrigger])

  const handleOpenReviews = (triggerEl?: HTMLButtonElement | null) => {
    setPendingSurfaceOpen('review')
    setPendingTrigger(triggerEl ?? null)
    onOpenChange(false)
  }

  const handleOpenAlbum = (triggerEl?: HTMLButtonElement | null) => {
    setPendingSurfaceOpen('album')
    setPendingTrigger(triggerEl ?? null)
    onOpenChange(false)
  }

  return (
    <div className="md:hidden">
      <Drawer open={open} onOpenChange={onOpenChange}>
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
              <Suspense fallback={<CourseDetailSkeleton />}>
                <CourseDetailPanel
                  course={selectedCourse}
                  pois={pois ?? []}
                  selectedPoiId={selectedPoiId}
                  onSelectPoi={onSelectPoi}
                  uphillSegments={uphillSegments ?? []}
                  canEditCourse={canEditSelectedCourse}
                  reviews={reviews ?? []}
                  reviewStats={reviewStats ?? null}
                  albumPreviewPhotos={albumPreviewPhotos}
                  user={user}
                  reviewTriggerId={selectedCourse ? `bottom-sheet-review-trigger-${selectedCourse.id}` : undefined}
                  albumTriggerId={selectedCourse ? `bottom-sheet-album-trigger-${selectedCourse.id}` : undefined}
                  onOpenReviews={handleOpenReviews}
                  onOpenAlbum={handleOpenAlbum}
                  onAlbumPhotoUploaded={onAlbumPhotoUploaded}
                />
              </Suspense>
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

function CourseDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-20 rounded-full bg-muted/50 animate-pulse" />
      <div className="h-10 rounded-xl bg-muted/50 animate-pulse" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
        <div className="h-20 rounded-2xl bg-muted/50 animate-pulse" />
      </div>
      <div className="h-32 rounded-3xl bg-muted/50 animate-pulse" />
    </div>
  )
}
