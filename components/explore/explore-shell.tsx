'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import { CourseAlbumSurface } from '@/components/courses/course-album-surface'
import { CourseReviewsSurface } from '@/components/courses/course-reviews-surface'
import { Sidebar } from '@/components/layout/sidebar'
import { BottomSheet } from '@/components/layout/bottom-sheet'
import KakaoMap from '@/components/map/kakao-map'
import { ElevationPanel } from '@/components/map/elevation-panel'
import { Button } from '@/components/ui/button'
import { RegionOnboardingModal } from '@/components/region/region-onboarding-modal'
import { Drawer, DrawerContent } from '@/components/ui/drawer'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import { filterSafeAlbumPhotos } from '@/lib/course-album'
import {
  canEnterMapFullscreen,
  shouldExitMapFullscreen,
} from '@/lib/explore-map-fullscreen-ui'
import {
  getReviewSurfaceViewerState,
  shouldRestoreCourseSheet,
  type ReviewSurfaceSource,
} from '@/lib/course-reviews-surface-ui'
import type { RouteHoverPoint } from '@/lib/elevation-hover-sync'
import type { WeatherMapPoint, WindMapOverlay, WindSegment } from '@/lib/wind-analysis'
import { supabase } from '@/lib/supabase'
import type {
  CourseAlbumPhoto,
  CourseDetail,
  CourseReview,
  CourseReviewStats,
  CourseListItem,
  FamousUphill,
  PoiMapItem,
  UphillSegment,
} from '@/types/course'
import type { User } from '@supabase/supabase-js'

type ExploreSurfaceKind = 'review' | 'album'

const MIN_SIDEBAR_WIDTH = 280
const MAX_SIDEBAR_WIDTH = 520

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
  famousUphills: FamousUphill[]
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
  famousUphills,
  reviews,
  reviewStats,
}: ExploreShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [localPois, setLocalPois] = useState<PoiMapItem[]>(pois)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [hoveredRoutePoint, setHoveredRoutePoint] = useState<RouteHoverPoint | null>(null)
  const [windDirection, setWindDirection] = useState<number | null>(null)
  const [windSpeed, setWindSpeed] = useState<number | null>(null)
  const [windSegmentsOverride, setWindSegmentsOverride] = useState<WindSegment[] | null>(null)
  const [windOverlays, setWindOverlays] = useState<WindMapOverlay[]>([])
  const [weatherPoints, setWeatherPoints] = useState<WeatherMapPoint[]>([])
  const [albumPhotos, setAlbumPhotos] = useState<CourseAlbumPhoto[]>([])
  const [albumPreviewPhotos, setAlbumPreviewPhotos] = useState<CourseAlbumPhoto[]>([])
  const [albumLoading, setAlbumLoading] = useState(false)
  const [albumError, setAlbumError] = useState<string | null>(null)
  const [albumReloadToken, setAlbumReloadToken] = useState(0)
  const [selectedAlbumPhotoId, setSelectedAlbumPhotoId] = useState<string | null>(null)
  const [isCourseSheetOpen, setIsCourseSheetOpen] = useState(false)
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  const [activeSurfaceKind, setActiveSurfaceKind] = useState<ExploreSurfaceKind | null>(null)
  const [surfaceSource, setSurfaceSource] = useState<ReviewSurfaceSource>(null)
  const [shouldReopenCourseSheet, setShouldReopenCourseSheet] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
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
    setHoveredRoutePoint(null)
    setWindDirection(null)
    setWindSpeed(null)
    setWindSegmentsOverride(null)
    setWindOverlays([])
    setWeatherPoints([])
    setAlbumPreviewPhotos([])
    setAlbumPhotos([])
    setAlbumLoading(false)
    setAlbumError(null)
    setAlbumReloadToken(0)
    setSelectedAlbumPhotoId(null)
    setIsCourseSheetOpen(false)
    setIsMapFullscreen(false)
    setActiveSurfaceKind(null)
    setSurfaceSource(null)
    setShouldReopenCourseSheet(false)
    lastSurfaceTriggerIdRef.current = null
  }, [selectedCourseId])

  useEffect(() => {
    setLocalPois(pois)
  }, [pois, selectedCourseId])

  useEffect(() => {
    if (selectedPoiId && !localPois.some((poi) => poi.id === selectedPoiId)) {
      setSelectedPoiId(null)
    }
  }, [localPois, selectedPoiId])

  useEffect(() => {
    if (selectedAlbumPhotoId && !albumPhotos.some((photo) => photo.id === selectedAlbumPhotoId)) {
      setSelectedAlbumPhotoId(null)
    }
  }, [albumPhotos, selectedAlbumPhotoId])

  useEffect(() => {
    if (!selectedCourse) {
      return
    }

    const controller = new AbortController()
    const courseId = selectedCourse.id

    async function loadPreview() {
      try {
        const response = await fetch(`/api/courses/${courseId}/album?limit=4`, {
          signal: controller.signal,
        })
        const payload = await response.json().catch(() => ({}))

        if (response.ok && Array.isArray(payload.photos)) {
          setAlbumPreviewPhotos(payload.photos)
        }
      } catch (loadError) {
        if ((loadError as Error).name === 'AbortError') {
          return
        }
      }
    }

    void loadPreview()

    return () => controller.abort()
  }, [selectedCourse])

  useEffect(() => {
    if (!selectedCourse) {
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
  }, [albumReloadToken, selectedCourse])

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
    () => filterSafeAlbumPhotos({ albumPhotos, selectedCourseId }),
    [albumPhotos, selectedCourseId],
  )

  const handleWindDataChange = useCallback(
    (dir: number | null, spd: number | null) => {
      setWindDirection(dir)
      setWindSpeed(spd)
    },
    [],
  )

  const handleWindSegmentsChange = useCallback(
    (segments: WindSegment[] | null) => {
      setWindSegmentsOverride(segments)
    },
    [],
  )

  const handleWindMapOverlaysChange = useCallback(
    (overlays: WindMapOverlay[]) => {
      setWindOverlays(overlays)
    },
    [],
  )

  const handleWeatherMapPointsChange = useCallback(
    (points: WeatherMapPoint[]) => {
      setWeatherPoints(points)
    },
    [],
  )

  const handleInlineAlbumPhotoUploaded = useCallback(
    (photo: CourseAlbumPhoto) => {
      setAlbumPreviewPhotos((prev) => [photo, ...prev].slice(0, 4))
      setAlbumPhotos((prev) => [photo, ...prev])
    },
    [],
  )

  const handlePoiCreated = useCallback((poi: PoiMapItem) => {
    setLocalPois((prev) => prev.some((item) => item.id === poi.id) ? prev : [...prev, poi])
    setSelectedPoiId(poi.id)
  }, [])

  const canShowMapFullscreen = canEnterMapFullscreen({
    hasSelectedCourse: Boolean(selectedCourse),
    activeSurfaceKind,
  })

  useEffect(() => {
    if (!isMapFullscreen) {
      return
    }

    if (shouldExitMapFullscreen({
      hasSelectedCourse: Boolean(selectedCourse),
      activeSurfaceKind,
      isCourseSheetOpen,
    })) {
      setIsMapFullscreen(false)
    }
  }, [activeSurfaceKind, isCourseSheetOpen, isMapFullscreen, selectedCourse])

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

  const handleOpenMapFullscreen = () => {
    setIsCourseSheetOpen(false)
    setIsMapFullscreen(true)
  }

  const handleOpenCourseSheet = () => {
    setIsMapFullscreen(false)
    setIsCourseSheetOpen(true)
  }

  const handleCourseSheetOpenChange = (open: boolean) => {
    setIsCourseSheetOpen(open)
    if (open) {
      setIsMapFullscreen(false)
    }
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
      setIsMapFullscreen(false)
      setIsCourseSheetOpen(true)
      setShouldReopenCourseSheet(false)
      restoreFocusToSurfaceTrigger()
    })
  }, [activeSurfaceKind, shouldReopenCourseSheet])

  useEffect(() => {
    if (!isResizingSidebar) {
      return
    }

    const handlePointerMove = (event: MouseEvent) => {
      const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, event.clientX - containerLeft),
      )
      setSidebarWidth(nextWidth)
    }

    const handlePointerUp = () => {
      setIsResizingSidebar(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [isResizingSidebar])

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-64px)]">
      <Sidebar
        courses={courses}
        startPoints={startPoints}
        themes={themes}
        hasActiveFilters={hasActiveFilters}
        selectedCourse={selectedCourse}
        pois={localPois}
        selectedPoiId={selectedPoiId}
        onSelectPoi={setSelectedPoiId}
        uphillSegments={uphillSegments}
        famousUphills={famousUphills}
        canEditSelectedCourse={canEditSelectedCourse}
        reviews={reviews}
        reviewStats={reviewStats}
        albumPreviewPhotos={albumPreviewPhotos}
        user={user}
        onOpenReviews={(triggerEl) =>
          openSurface({ kind: 'review', source: 'sidebar', triggerEl })
        }
        onOpenAlbum={(triggerEl) =>
          openSurface({ kind: 'album', source: 'sidebar', triggerEl })
        }
        onAlbumPhotoUploaded={handleInlineAlbumPhotoUploaded}
        onPoiCreated={handlePoiCreated}
        onWindDataChange={handleWindDataChange}
        onWindSegmentsChange={handleWindSegmentsChange}
        onWindMapOverlaysChange={handleWindMapOverlaysChange}
        onWeatherMapPointsChange={handleWeatherMapPointsChange}
        width={sidebarWidth}
      />
      <div className="relative hidden w-3 shrink-0 md:block">
        <button
          type="button"
          className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize group"
          onMouseDown={() => setIsResizingSidebar(true)}
          onDoubleClick={() => setSidebarWidth(320)}
          aria-label="사이드 패널 너비 조절"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-foreground/35" />
          <span className="absolute left-1/2 top-1/2 h-16 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/20 transition-colors group-hover:bg-muted-foreground/40" />
        </button>
      </div>
      <main className="flex-1 flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0">
          <KakaoMap
            routeQueryString={routeQueryString}
            selectedCourseId={selectedCourseId}
            selectedCourseRouteGeoJSON={selectedCourse?.route_geojson ?? null}
            selectedCourseRoutePreviewPoints={selectedCourse?.route_preview_points ?? null}
            selectedCourseRouteRenderMetadata={selectedCourse?.route_render_metadata ?? null}
            pois={localPois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
            albumPhotos={safeAlbumPhotos}
            selectedAlbumPhotoId={selectedAlbumPhotoId}
            onSelectAlbumPhoto={setSelectedAlbumPhotoId}
            hoveredRoutePoint={hoveredRoutePoint}
            windOverlays={windOverlays}
            weatherPoints={weatherPoints}
          />
          {selectedCourse && canShowMapFullscreen && !isMapFullscreen ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end px-4 pt-4 md:hidden">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="pointer-events-auto rounded-full bg-background/92 shadow-lg backdrop-blur"
                onClick={handleOpenMapFullscreen}
              >
                <Maximize2 className="h-4 w-4" />
                지도 크게 보기
              </Button>
            </div>
          ) : null}
          {selectedCourse && isMapFullscreen ? (
            <>
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-black/35 to-transparent md:hidden" />
              <div className="absolute inset-x-0 top-4 z-40 flex items-start justify-between px-4 md:hidden">
                <div className="max-w-[calc(100%-4.5rem)] rounded-full bg-background/92 px-3 py-2 text-sm font-medium text-foreground shadow-lg backdrop-blur">
                  {selectedCourse.title}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  className="rounded-full bg-background/92 shadow-lg backdrop-blur"
                  onClick={() => setIsMapFullscreen(false)}
                  aria-label="지도 전체화면 해제"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 md:hidden">
                <Button
                  type="button"
                  size="lg"
                  className="w-full max-w-xs rounded-full shadow-lg"
                  onClick={handleOpenCourseSheet}
                >
                  <ChevronUp className="h-4 w-4" />
                  코스 정보 보기
                </Button>
              </div>
            </>
          ) : null}
          <BottomSheet
            courses={courses}
            startPoints={startPoints}
            themes={themes}
            hasActiveFilters={hasActiveFilters}
            selectedCourse={selectedCourse}
            pois={localPois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={setSelectedPoiId}
            uphillSegments={uphillSegments}
            famousUphills={famousUphills}
            canEditSelectedCourse={canEditSelectedCourse}
            reviews={reviews}
            reviewStats={reviewStats}
            albumPreviewPhotos={albumPreviewPhotos}
            user={user}
            open={isCourseSheetOpen}
            showTrigger={!isMapFullscreen}
            onOpenChange={handleCourseSheetOpenChange}
            onOpenReviews={(triggerEl) =>
              openSurface({ kind: 'review', source: 'bottom-sheet', triggerEl })
            }
            onOpenAlbum={(triggerEl) =>
              openSurface({ kind: 'album', source: 'bottom-sheet', triggerEl })
            }
            onAlbumPhotoUploaded={handleInlineAlbumPhotoUploaded}
            onPoiCreated={handlePoiCreated}
            onWindDataChange={handleWindDataChange}
            onWindSegmentsChange={handleWindSegmentsChange}
            onWindMapOverlaysChange={handleWindMapOverlaysChange}
            onWeatherMapPointsChange={handleWeatherMapPointsChange}
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
        {selectedCourse && !isMapFullscreen && (
          <ElevationPanel
            routeGeoJSON={selectedCourse.route_geojson}
            routeRenderMetadata={selectedCourse.route_render_metadata ?? null}
            uphillSegments={uphillSegments}
            pois={localPois}
            albumPhotos={albumPreviewPhotos}
            courseTitle={selectedCourse.title}
            windDirection={windDirection}
            windSpeed={windSpeed}
            windSegmentsOverride={windSegmentsOverride}
            onHoverPointChange={setHoveredRoutePoint}
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
      <RegionOnboardingModal />
    </div>
  )
}
