import { Suspense } from 'react'
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

interface SidebarProps {
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
  onPoiCreated?: (poi: PoiMapItem) => void
}

export function Sidebar({
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
  onPoiCreated,
}: SidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-[280px] border-r bg-background">
      <div className="overflow-y-auto h-full p-4">
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
              reviewTriggerId={selectedCourse ? `sidebar-review-trigger-${selectedCourse.id}` : undefined}
              albumTriggerId={selectedCourse ? `sidebar-album-trigger-${selectedCourse.id}` : undefined}
              onOpenReviews={onOpenReviews}
              onOpenAlbum={onOpenAlbum}
              onAlbumPhotoUploaded={onAlbumPhotoUploaded}
              onPoiCreated={onPoiCreated}
            />
          </Suspense>
        ) : (
          <>
            {/* Filter section */}
            <Suspense fallback={<FilterSkeleton />}>
              <CourseFilter startPoints={startPoints} themes={themes} />
            </Suspense>

            {/* Course list */}
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                코스 목록
              </h2>
              <Suspense fallback={<CourseListSkeleton />}>
                <CourseListClient
                  courses={courses}
                  hasActiveFilters={hasActiveFilters}
                />
              </Suspense>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}

function FilterSkeleton() {
  return (
    <div className="mb-6">
      <div className="h-5 w-12 rounded bg-muted/50 animate-pulse mb-3" />
      <div className="flex flex-col gap-3">
        <div className="h-9 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-20 rounded-md bg-muted/50 animate-pulse" />
        <div className="h-16 rounded-md bg-muted/50 animate-pulse" />
      </div>
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
