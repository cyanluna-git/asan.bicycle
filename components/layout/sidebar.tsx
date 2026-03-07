import { Suspense } from 'react'
import { CourseFilter } from '@/components/filter/course-filter'
import { CourseListClient } from '@/components/courses/course-list-client'
import { CourseDetailPanel } from '@/components/courses/course-detail-panel'
import type {
  CourseListItem,
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'

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
  onOpenReviews?: () => void
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
  onOpenReviews,
}: SidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-[280px] border-r bg-background">
      <div className="overflow-y-auto h-full p-4">
        {selectedCourse ? (
          <CourseDetailPanel
            course={selectedCourse}
            pois={pois ?? []}
            selectedPoiId={selectedPoiId}
            onSelectPoi={onSelectPoi}
            uphillSegments={uphillSegments ?? []}
            canEditCourse={canEditSelectedCourse}
            reviews={reviews ?? []}
            reviewStats={reviewStats ?? null}
            onOpenReviews={onOpenReviews}
          />
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
