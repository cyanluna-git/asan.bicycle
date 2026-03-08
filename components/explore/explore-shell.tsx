'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CourseAlbumSurface } from '@/components/courses/course-album-surface'
import { CourseReviewsSurface } from '@/components/courses/course-reviews-surface'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import KakaoMap from '@/components/map/kakao-map'
import { ElevationPanel } from '@/components/map/elevation-panel'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { filterSafeAlbumPhotos } from '@/lib/course-album'
import {
  getReviewSurfaceViewerState,
  shouldRestoreCourseSheet,
  type ReviewSurfaceSource,
} from '@/lib/course-reviews-surface-ui'
import { supabase } from '@/lib/supabase'
import type {
  CourseAlbumPhoto,
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  CourseListItem,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

type ExploreSurfaceKind = 'review' | 'album'

interface ExploreShellProps {
  courses: CourseListItem[]
  routeQueryString: string
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
  routeQueryString,
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
  const [albumPhotos, setAlbumPhotos] = useState<CourseAlbumPhoto[]>([])
  const [albumLoading, setAlbumLoading] = useState(false)
  const [albumError, setAlbumError] = useState<string | null>(null)
  const [albumReloadToken, setAlbumReloadToken] = useState(0)
  const [selectedAlbumPhotoId, setSelectedAlbumPhotoId] = useState<string | null>(null)
  const [isCourseSheetOpen, setIsCourseSheetOpen] = useState(false)
  const [activeSurfaceKind, setActiveSurfaceKind] = useState<ExploreSurfaceKind | null>(null)
  const [surfaceSource, setSurfaceSource] = useState<ReviewSurfaceSource>(null)
  const [shouldReopenCourseSheet, setShouldReopenCourseSheet] = useState(false)
  const lastSurfaceTriggerIdRef = useRef<string | null>(null)

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
    setAlbumPhotos([])
    setAlbumLoading(false)
    setAlbumError(null)
    setAlbumReloadToken(0)
    setSelectedAlbumPhotoId(null)
    setIsCourseSheetOpen(false)
    setActiveSurfaceKind(null)
    setSurfaceSource(null)
    setShouldReopenCourseSheet(false)
    lastSurfaceTriggerIdRef.current = null
  }, [selectedCourseId])

  useEffect(() => {
    if (selectedPoiId && !pois.some((poi) => poi.id === selectedPoiId)) {
      setSelectedPoiId(null)
    }
  }, [pois, selectedPoiId])

  useEffect(() => {
    if (selectedAlbumPhotoId && !albumPhotos.some((photo) => photo.id === selectedAlbumPhotoId)) {
      setSelectedAlbumPhotoId(null)
    }
  }, [albumPhotos, selectedAlbumPhotoId])

  useEffect(() => {
    if (!selectedCourse || activeSurfaceKind !== 'album') {
      return
    }

    const controller = new AbortController()
    const courseId = selectedCourse.id

    async function loadAlbum() {
      setAlbumLoading(true)
      setAlbumError(null)

      try {
        const response = await fetch(`/api/courses/${courseId}/album`, {
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : '코스 앨범을 불러오지 못했습니다.',
          )
        }

        setAlbumPhotos(Array.isArray(payload.photos) ? payload.photos : [])
      } catch (loadError) {
        if ((loadError as Error).name === 'AbortError') {
          return
        }

        setAlbumError(loadError instanceof Error ? loadError.message : '코스 앨범을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) {
          setAlbumLoading(false)
        }
      }
    }

    void loadAlbum()

    return () => controller.abort()
  }, [activeSurfaceKind, albumReloadToken, selectedCourse])

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

  const safeAlbumPhotos = useMemo(
    () => filterSafeAlbumPhotos({ activeSurfaceKind, albumPhotos, selectedCourseId }),
    [activeSurfaceKind, albumPhotos, selectedCourseId],
  )

  const restoreFocusToSurfaceTrigger = () => {
    const triggerId = lastSurfaceTriggerIdRef.current
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

  const openSurface = ({
    kind,
    source,
    triggerEl,
  }: {
    kind: ExploreSurfaceKind
    source: Exclude<ReviewSurfaceSource, null>
    triggerEl?: HTMLButtonElement | null
  }) => {
    setSurfaceSource(source)
    lastSurfaceTriggerIdRef.current = triggerEl?.id ?? null
    setActiveSurfaceKind(kind)
  }

  const handleCloseSurface = () => {
    const shouldRestore = shouldRestoreCourseSheet({
      source: surfaceSource,
      hasSelectedCourse: Boolean(selectedCourse),
    })

    setActiveSurfaceKind(null)
    setSurfaceSource(null)

    if (shouldRestore) {
      setShouldReopenCourseSheet(true)
      return
    }

    restoreFocusToSurfaceTrigger()
  }

  useEffect(() => {
    if (activeSurfaceKind || !shouldReopenCourseSheet) {
      return
    }

    window.requestAnimationFrame(() => {
      setIsCourseSheetOpen(true)
      setShouldReopenCourseSheet(false)
      restoreFocusToSurfaceTrigger()
    })
  }, [activeSurfaceKind, shouldReopenCourseSheet])

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
          openSurface({ kind: 'review', source: 'sidebar', triggerEl })
        }
        onOpenAlbum={(triggerEl) =>
          openSurface({ kind: 'album', source: 'sidebar', triggerEl })
        }
      />
      <main className="flex-1 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0">
          <KakaoMap
            routeQueryString={routeQueryString}
            selectedCourseId={selectedCourseId}
            pois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
            albumPhotos={safeAlbumPhotos}
            selectedAlbumPhotoId={selectedAlbumPhotoId}
            onSelectAlbumPhoto={setSelectedAlbumPhotoId}
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
              openSurface({ kind: 'review', source: 'bottom-sheet', triggerEl })
            }
            onOpenAlbum={(triggerEl) =>
              openSurface({ kind: 'album', source: 'bottom-sheet', triggerEl })
            }
          />
          {selectedCourse && surfaceSource === 'bottom-sheet' && activeSurfaceKind ? (
            <Drawer
              open={Boolean(activeSurfaceKind)}
              onOpenChange={(nextOpen) => {
                if (nextOpen) {
                  if (activeSurfaceKind) {
                    setActiveSurfaceKind(activeSurfaceKind)
                  }
                  return
                }
                handleCloseSurface()
              }}
            >
              <DrawerContent className="md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-none">
                {activeSurfaceKind === 'review' ? (
                  <CourseReviewsSurface
                    courseId={selectedCourse.id}
                    courseTitle={selectedCourse.title}
                    reviews={reviews}
                    stats={reviewStats}
                    viewerState={viewerState}
                    onClose={handleCloseSurface}
                    className="h-[100dvh]"
                  />
                ) : (
                  <CourseAlbumSurface
                    courseId={selectedCourse.id}
                    courseTitle={selectedCourse.title}
                    isLoggedIn={Boolean(user)}
                    currentUserId={user?.id ?? null}
                    isAdmin={isAdminUser(user)}
                    photos={safeAlbumPhotos}
                    isLoading={albumLoading}
                    error={albumError}
                    selectedPhotoId={selectedAlbumPhotoId}
                    onRetry={() => setAlbumReloadToken((value) => value + 1)}
                    onUploaded={(photo) => {
                      setAlbumPhotos((prev) => [photo, ...prev])
                      setSelectedAlbumPhotoId(photo.id)
                    }}
                    onSelectPhoto={setSelectedAlbumPhotoId}
                    onDeletedPhoto={(photoId) => {
                      setAlbumPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
                      setSelectedAlbumPhotoId((prev) => (prev === photoId ? null : prev))
                    }}
                    onClose={handleCloseSurface}
                    className="h-[100dvh]"
                  />
                )}
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
      {selectedCourse && activeSurfaceKind && surfaceSource !== 'bottom-sheet' ? (
        <aside className="hidden md:flex w-[360px] border-l bg-background">
          {activeSurfaceKind === 'review' ? (
            <CourseReviewsSurface
              courseId={selectedCourse.id}
              courseTitle={selectedCourse.title}
              reviews={reviews}
              stats={reviewStats}
              viewerState={viewerState}
              onClose={handleCloseSurface}
            />
          ) : (
            <CourseAlbumSurface
              courseId={selectedCourse.id}
              courseTitle={selectedCourse.title}
              isLoggedIn={Boolean(user)}
              currentUserId={user?.id ?? null}
              isAdmin={isAdminUser(user)}
              photos={safeAlbumPhotos}
              isLoading={albumLoading}
              error={albumError}
              selectedPhotoId={selectedAlbumPhotoId}
              onRetry={() => setAlbumReloadToken((value) => value + 1)}
              onUploaded={(photo) => {
                setAlbumPhotos((prev) => [photo, ...prev])
                setSelectedAlbumPhotoId(photo.id)
              }}
              onSelectPhoto={setSelectedAlbumPhotoId}
              onDeletedPhoto={(photoId) => {
                setAlbumPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
                setSelectedAlbumPhotoId((prev) => (prev === photoId ? null : prev))
              }}
              onClose={handleCloseSurface}
            />
          )}
        </aside>
      ) : null}
    </div>
  )
}
