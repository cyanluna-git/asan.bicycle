'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CourseReviewsSurface } from '@/components/courses/course-reviews-surface'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import KakaoMap from '@/components/map/kakao-map'
import { ElevationPanel } from '@/components/map/elevation-panel'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import {
  getReviewSurfaceViewerState,
  shouldRestoreCourseSheet,
  type ReviewSurfaceSource,
} from '@/lib/course-reviews-surface-ui'
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
  const [isCourseSheetOpen, setIsCourseSheetOpen] = useState(false)
  const [isReviewSurfaceOpen, setIsReviewSurfaceOpen] = useState(false)
  const [reviewSurfaceSource, setReviewSurfaceSource] = useState<ReviewSurfaceSource>(null)
  const [shouldReopenCourseSheet, setShouldReopenCourseSheet] = useState(false)
  const lastReviewTriggerIdRef = useRef<string | null>(null)

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
    setIsCourseSheetOpen(false)
    setIsReviewSurfaceOpen(false)
    setReviewSurfaceSource(null)
    setShouldReopenCourseSheet(false)
    lastReviewTriggerIdRef.current = null
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

  const viewerState = useMemo(
    () =>
      getReviewSurfaceViewerState({
        isLoggedIn: Boolean(user),
        hasOwnReview: Boolean(user && reviews.some((review) => review.user_id === user.id)),
      }),
    [reviews, user],
  )

  const restoreFocusToReviewTrigger = () => {
    const triggerId = lastReviewTriggerIdRef.current
    if (!triggerId) {
      return
    }

    window.requestAnimationFrame(() => {
      const trigger = document.getElementById(triggerId)
      if (trigger instanceof HTMLElement) {
        trigger.focus()
      }
    })
  }

  const openReviewSurface = ({
    source,
    triggerEl,
  }: {
    source: Exclude<ReviewSurfaceSource, null>
    triggerEl?: HTMLButtonElement | null
  }) => {
    setReviewSurfaceSource(source)
    lastReviewTriggerIdRef.current = triggerEl?.id ?? null
    setIsReviewSurfaceOpen(true)
  }

  const handleCloseReviewSurface = () => {
    const shouldRestore = shouldRestoreCourseSheet({
      source: reviewSurfaceSource,
      hasSelectedCourse: Boolean(selectedCourse),
    })

    setIsReviewSurfaceOpen(false)
    setReviewSurfaceSource(null)

    if (shouldRestore) {
      setShouldReopenCourseSheet(true)
      return
    }

    restoreFocusToReviewTrigger()
  }

  useEffect(() => {
    if (isReviewSurfaceOpen || !shouldReopenCourseSheet) {
      return
    }

    window.requestAnimationFrame(() => {
      setIsCourseSheetOpen(true)
      setShouldReopenCourseSheet(false)
      restoreFocusToReviewTrigger()
    })
  }, [isReviewSurfaceOpen, shouldReopenCourseSheet])

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
        onOpenReviews={(triggerEl) =>
          openReviewSurface({ source: 'sidebar', triggerEl })
        }
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
            open={isCourseSheetOpen}
            onOpenChange={setIsCourseSheetOpen}
            onOpenReviews={(triggerEl) =>
              openReviewSurface({ source: 'bottom-sheet', triggerEl })
            }
          />
          {selectedCourse && reviewSurfaceSource === 'bottom-sheet' ? (
            <Drawer
              open={isReviewSurfaceOpen}
              onOpenChange={(nextOpen) => {
                if (nextOpen) {
                  setIsReviewSurfaceOpen(true)
                  return
                }
                handleCloseReviewSurface()
              }}
            >
              <DrawerContent className="md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-none">
                <CourseReviewsSurface
                  courseId={selectedCourse.id}
                  courseTitle={selectedCourse.title}
                  reviews={reviews}
                  stats={reviewStats}
                  viewerState={viewerState}
                  onClose={handleCloseReviewSurface}
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
      {selectedCourse && isReviewSurfaceOpen && reviewSurfaceSource !== 'bottom-sheet' ? (
        <aside className="hidden md:flex w-[360px] border-l bg-background">
          <CourseReviewsSurface
            courseId={selectedCourse.id}
            courseTitle={selectedCourse.title}
            reviews={reviews}
            stats={reviewStats}
            viewerState={viewerState}
            onClose={handleCloseReviewSurface}
          />
        </aside>
      ) : null}
    </div>
  )
}
