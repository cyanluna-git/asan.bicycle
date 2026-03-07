'use client'

import { useEffect, useState } from 'react'
import { CourseReviewsSurface } from '@/components/courses/course-reviews-surface'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import KakaoMap from '@/components/map/kakao-map'
import { ElevationPanel } from '@/components/map/elevation-panel'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { supabase } from '@/lib/supabase'
import type {
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  CourseListItem,
  CourseMapItem,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface ExploreShellProps {
  courses: CourseListItem[]
  courseRoutes: CourseMapItem[]
  startPoints: { id: string; name: string }[]
  themes: string[]
  hasActiveFilters: boolean
  selectedCourseId: string | null
  selectedCourse: CourseDetail | null
  pois: PoiMapItem[]
  uphillSegments: UphillSegment[]
  reviews: CourseReview[]
  reviewStats: CourseReviewStats | null
}

export function ExploreShell({
  courses,
  courseRoutes,
  startPoints,
  themes,
  hasActiveFilters,
  selectedCourseId,
  selectedCourse,
  pois,
  uphillSegments,
  reviews,
  reviewStats,
}: ExploreShellProps) {
  const [user, setUser] = useState<User | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [isReviewSurfaceOpen, setIsReviewSurfaceOpen] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    }).catch(() => {})

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setSelectedPoiId(null)
    setIsReviewSurfaceOpen(false)
  }, [selectedCourseId])

  useEffect(() => {
    if (selectedPoiId && !pois.some((poi) => poi.id === selectedPoiId)) {
      setSelectedPoiId(null)
    }
  }, [pois, selectedPoiId])

  const canEditSelectedCourse = selectedCourse
    ? canEditCourse({
        courseOwnerId: selectedCourse.created_by,
        userId: user?.id,
        isAdmin: isAdminUser(user),
      })
    : false

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <Sidebar
        courses={courses}
        startPoints={startPoints}
        themes={themes}
        hasActiveFilters={hasActiveFilters}
        selectedCourse={selectedCourse}
        pois={pois}
        selectedPoiId={selectedPoiId}
        onSelectPoi={setSelectedPoiId}
        uphillSegments={uphillSegments}
        canEditSelectedCourse={canEditSelectedCourse}
        reviews={reviews}
        reviewStats={reviewStats}
        onOpenReviews={() => setIsReviewSurfaceOpen(true)}
      />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0">
          <KakaoMap
            courses={courseRoutes}
            selectedCourseId={selectedCourseId}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
          />
          <BottomSheet
            courses={courses}
            startPoints={startPoints}
            themes={themes}
            hasActiveFilters={hasActiveFilters}
            selectedCourse={selectedCourse}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
            uphillSegments={uphillSegments}
            canEditSelectedCourse={canEditSelectedCourse}
            reviews={reviews}
            reviewStats={reviewStats}
            onOpenReviews={() => setIsReviewSurfaceOpen(true)}
          />
          {selectedCourse ? (
            <Drawer
              open={isReviewSurfaceOpen}
              onOpenChange={setIsReviewSurfaceOpen}
            >
              <DrawerContent className="md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-none">
                <CourseReviewsSurface
                  courseId={selectedCourse.id}
                  courseTitle={selectedCourse.title}
                  reviews={reviews}
                  stats={reviewStats}
                  onClose={() => setIsReviewSurfaceOpen(false)}
                  className="h-[100dvh]"
                />
              </DrawerContent>
            </Drawer>
          ) : null}
        </div>
        {selectedCourse && (
          <ElevationPanel
            routeGeoJSON={selectedCourse.route_geojson}
            uphillSegments={uphillSegments}
            courseTitle={selectedCourse.title}
          />
        )}
      </main>
      {selectedCourse && isReviewSurfaceOpen ? (
        <aside className="hidden md:flex w-[360px] border-l bg-background">
          <CourseReviewsSurface
            courseId={selectedCourse.id}
            courseTitle={selectedCourse.title}
            reviews={reviews}
            stats={reviewStats}
            onClose={() => setIsReviewSurfaceOpen(false)}
          />
        </aside>
      ) : null}
    </div>
  )
}
