'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
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

// ---------------------------------------------------------------------------
// Domain reducers — group related state to avoid 15+ individual useState calls
// ---------------------------------------------------------------------------

type WindState = {
  direction: number | null
  speed: number | null
  segmentsOverride: WindSegment[] | null
  overlays: WindMapOverlay[]
  weatherPoints: WeatherMapPoint[]
}
const WIND_INITIAL: WindState = {
  direction: null, speed: null, segmentsOverride: null, overlays: [], weatherPoints: [],
}
type WindAction =
  | { type: 'SET_DATA'; direction: number | null; speed: number | null }
  | { type: 'SET_SEGMENTS'; segments: WindSegment[] | null }
  | { type: 'SET_OVERLAYS'; overlays: WindMapOverlay[] }
  | { type: 'SET_WEATHER_POINTS'; points: WeatherMapPoint[] }
  | { type: 'RESET' }
function windReducer(state: WindState, action: WindAction): WindState {
  switch (action.type) {
    case 'SET_DATA': return { ...state, direction: action.direction, speed: action.speed }
    case 'SET_SEGMENTS': return { ...state, segmentsOverride: action.segments }
    case 'SET_OVERLAYS': return { ...state, overlays: action.overlays }
    case 'SET_WEATHER_POINTS': return { ...state, weatherPoints: action.points }
    case 'RESET': return WIND_INITIAL
  }
}

type AlbumState = {
  photos: CourseAlbumPhoto[]
  previewPhotos: CourseAlbumPhoto[]
  loading: boolean
  error: string | null
  reloadToken: number
  selectedId: string | null
}
const ALBUM_INITIAL: AlbumState = {
  photos: [], previewPhotos: [], loading: false, error: null, reloadToken: 0, selectedId: null,
}
type AlbumAction =
  | { type: 'SET_PHOTOS'; photos: CourseAlbumPhoto[] }
  | { type: 'SET_PREVIEW_PHOTOS'; photos: CourseAlbumPhoto[] }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'INCREMENT_RELOAD' }
  | { type: 'SET_SELECTED_ID'; id: string | null }
  | { type: 'PREPEND_PHOTO'; photo: CourseAlbumPhoto }
  | { type: 'DELETE_PHOTO'; photoId: string }
  | { type: 'RESET' }
function albumReducer(state: AlbumState, action: AlbumAction): AlbumState {
  switch (action.type) {
    case 'SET_PHOTOS': return { ...state, photos: action.photos }
    case 'SET_PREVIEW_PHOTOS': return { ...state, previewPhotos: action.photos }
    case 'SET_LOADING': return { ...state, loading: action.loading }
    case 'SET_ERROR': return { ...state, error: action.error }
    case 'INCREMENT_RELOAD': return { ...state, reloadToken: state.reloadToken + 1 }
    case 'SET_SELECTED_ID': return { ...state, selectedId: action.id }
    case 'PREPEND_PHOTO': return {
      ...state,
      photos: [action.photo, ...state.photos],
      previewPhotos: [action.photo, ...state.previewPhotos].slice(0, 4),
    }
    case 'DELETE_PHOTO': return {
      ...state,
      photos: state.photos.filter((p) => p.id !== action.photoId),
      selectedId: state.selectedId === action.photoId ? null : state.selectedId,
    }
    case 'RESET': return ALBUM_INITIAL
  }
}

type MapUIState = { isFullscreen: boolean; isCourseSheetOpen: boolean }
const MAP_UI_INITIAL: MapUIState = { isFullscreen: false, isCourseSheetOpen: false }
type MapUIAction =
  | { type: 'SET_FULLSCREEN'; value: boolean }
  | { type: 'SET_SHEET_OPEN'; value: boolean }
  | { type: 'OPEN_FULLSCREEN' }
  | { type: 'OPEN_COURSE_SHEET' }
  | { type: 'HANDLE_SHEET_CHANGE'; open: boolean }
  | { type: 'RESET' }
function mapUIReducer(state: MapUIState, action: MapUIAction): MapUIState {
  switch (action.type) {
    case 'SET_FULLSCREEN': return { ...state, isFullscreen: action.value }
    case 'SET_SHEET_OPEN': return { ...state, isCourseSheetOpen: action.value }
    case 'OPEN_FULLSCREEN': return { isFullscreen: true, isCourseSheetOpen: false }
    case 'OPEN_COURSE_SHEET': return { isFullscreen: false, isCourseSheetOpen: true }
    case 'HANDLE_SHEET_CHANGE': return {
      isCourseSheetOpen: action.open,
      isFullscreen: action.open ? false : state.isFullscreen,
    }
    case 'RESET': return MAP_UI_INITIAL
  }
}

type SurfaceState = {
  kind: ExploreSurfaceKind | null
  source: ReviewSurfaceSource
  shouldReopen: boolean
}
const SURFACE_INITIAL: SurfaceState = { kind: null, source: null, shouldReopen: false }
type SurfaceAction =
  | { type: 'OPEN'; kind: ExploreSurfaceKind; source: Exclude<ReviewSurfaceSource, null> }
  | { type: 'CLOSE' }
  | { type: 'CLOSE_WITH_REOPEN' }
  | { type: 'CLEAR_REOPEN' }
  | { type: 'RESET' }
function surfaceReducer(state: SurfaceState, action: SurfaceAction): SurfaceState {
  switch (action.type) {
    case 'OPEN': return { kind: action.kind, source: action.source, shouldReopen: false }
    case 'CLOSE': return { ...state, kind: null, source: null }
    case 'CLOSE_WITH_REOPEN': return { kind: null, source: null, shouldReopen: true }
    case 'CLEAR_REOPEN': return { ...state, shouldReopen: false }
    case 'RESET': return SURFACE_INITIAL
  }
}

// ---------------------------------------------------------------------------

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
  const lastSurfaceTriggerIdRef = useRef<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [localPois, setLocalPois] = useState<PoiMapItem[]>(pois)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [hoveredRoutePoint, setHoveredRoutePoint] = useState<RouteHoverPoint | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [wind, dispatchWind] = useReducer(windReducer, WIND_INITIAL)
  const [album, dispatchAlbum] = useReducer(albumReducer, ALBUM_INITIAL)
  const [mapUI, dispatchMapUI] = useReducer(mapUIReducer, MAP_UI_INITIAL)
  const [surface, dispatchSurface] = useReducer(surfaceReducer, SURFACE_INITIAL)

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
    dispatchWind({ type: 'RESET' })
    dispatchAlbum({ type: 'RESET' })
    dispatchMapUI({ type: 'RESET' })
    dispatchSurface({ type: 'RESET' })
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
    if (album.selectedId && !album.photos.some((photo) => photo.id === album.selectedId)) {
      dispatchAlbum({ type: 'SET_SELECTED_ID', id: null })
    }
  }, [album.photos, album.selectedId])

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
          dispatchAlbum({ type: 'SET_PREVIEW_PHOTOS', photos: payload.photos })
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
      dispatchAlbum({ type: 'SET_LOADING', loading: true })
      dispatchAlbum({ type: 'SET_ERROR', error: null })

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

        dispatchAlbum({ type: 'SET_PHOTOS', photos: Array.isArray(payload.photos) ? payload.photos : [] })
      } catch (loadError) {
        if ((loadError as Error).name === 'AbortError') {
          return
        }

        dispatchAlbum({ type: 'SET_ERROR', error: loadError instanceof Error ? loadError.message : '코스 앨범을 불러오지 못했습니다.' })
      } finally {
        if (!controller.signal.aborted) {
          dispatchAlbum({ type: 'SET_LOADING', loading: false })
        }
      }
    }

    void loadAlbum()

    return () => controller.abort()
  }, [album.reloadToken, selectedCourse])

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
    () => filterSafeAlbumPhotos({ albumPhotos: album.photos, selectedCourseId }),
    [album.photos, selectedCourseId],
  )

  const handleWindDataChange = useCallback(
    (dir: number | null, spd: number | null) => {
      dispatchWind({ type: 'SET_DATA', direction: dir, speed: spd })
    },
    [],
  )

  const handleWindSegmentsChange = useCallback(
    (segments: WindSegment[] | null) => {
      dispatchWind({ type: 'SET_SEGMENTS', segments })
    },
    [],
  )

  const handleWindMapOverlaysChange = useCallback(
    (overlays: WindMapOverlay[]) => {
      dispatchWind({ type: 'SET_OVERLAYS', overlays })
    },
    [],
  )

  const handleWeatherMapPointsChange = useCallback(
    (points: WeatherMapPoint[]) => {
      dispatchWind({ type: 'SET_WEATHER_POINTS', points })
    },
    [],
  )

  const handleInlineAlbumPhotoUploaded = useCallback(
    (photo: CourseAlbumPhoto) => {
      dispatchAlbum({ type: 'PREPEND_PHOTO', photo })
    },
    [],
  )

  const handlePoiCreated = useCallback((poi: PoiMapItem) => {
    setLocalPois((prev) => prev.some((item) => item.id === poi.id) ? prev : [...prev, poi])
    setSelectedPoiId(poi.id)
  }, [])

  const canShowMapFullscreen = canEnterMapFullscreen({
    hasSelectedCourse: Boolean(selectedCourse),
    activeSurfaceKind: surface.kind,
  })

  useEffect(() => {
    if (!mapUI.isFullscreen) {
      return
    }

    if (shouldExitMapFullscreen({
      hasSelectedCourse: Boolean(selectedCourse),
      activeSurfaceKind: surface.kind,
      isCourseSheetOpen: mapUI.isCourseSheetOpen,
    })) {
      dispatchMapUI({ type: 'SET_FULLSCREEN', value: false })
    }
  }, [surface.kind, mapUI.isCourseSheetOpen, mapUI.isFullscreen, selectedCourse])

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
    lastSurfaceTriggerIdRef.current = triggerEl?.id ?? null
    dispatchSurface({ type: 'OPEN', kind, source })
  }

  const handleOpenMapFullscreen = () => {
    dispatchMapUI({ type: 'OPEN_FULLSCREEN' })
  }

  const handleOpenCourseSheet = () => {
    dispatchMapUI({ type: 'OPEN_COURSE_SHEET' })
  }

  const handleCourseSheetOpenChange = (open: boolean) => {
    dispatchMapUI({ type: 'HANDLE_SHEET_CHANGE', open })
  }

  const handleCloseSurface = () => {
    const shouldRestore = shouldRestoreCourseSheet({
      source: surface.source,
      hasSelectedCourse: Boolean(selectedCourse),
    })

    if (shouldRestore) {
      dispatchSurface({ type: 'CLOSE_WITH_REOPEN' })
      return
    }

    dispatchSurface({ type: 'CLOSE' })
    restoreFocusToSurfaceTrigger()
  }

  useEffect(() => {
    if (surface.kind || !surface.shouldReopen) {
      return
    }

    window.requestAnimationFrame(() => {
      dispatchMapUI({ type: 'OPEN_COURSE_SHEET' })
      dispatchSurface({ type: 'CLEAR_REOPEN' })
      restoreFocusToSurfaceTrigger()
    })
  }, [surface.kind, surface.shouldReopen])

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
        albumPreviewPhotos={album.previewPhotos}
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
            selectedAlbumPhotoId={album.selectedId}
            onSelectAlbumPhoto={(id) => dispatchAlbum({ type: 'SET_SELECTED_ID', id })}
            hoveredRoutePoint={hoveredRoutePoint}
            windOverlays={wind.overlays}
            weatherPoints={wind.weatherPoints}
          />
          {selectedCourse && canShowMapFullscreen && !mapUI.isFullscreen ? (
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
          {selectedCourse && mapUI.isFullscreen ? (
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
                  onClick={() => dispatchMapUI({ type: 'SET_FULLSCREEN', value: false })}
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
            albumPreviewPhotos={album.previewPhotos}
            user={user}
            open={mapUI.isCourseSheetOpen}
            showTrigger={!mapUI.isFullscreen}
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
          {selectedCourse && surface.source === 'bottom-sheet' && surface.kind ? (
            <Drawer
              open={Boolean(surface.kind)}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                  handleCloseSurface()
                }
              }}
            >
              <DrawerContent className="md:hidden data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-none">
                {surface.kind === 'review' ? (
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
                    isLoading={album.loading}
                    error={album.error}
                    selectedPhotoId={album.selectedId}
                    onRetry={() => dispatchAlbum({ type: 'INCREMENT_RELOAD' })}
                    onUploaded={(photo) => {
                      dispatchAlbum({ type: 'PREPEND_PHOTO', photo })
                      dispatchAlbum({ type: 'SET_SELECTED_ID', id: photo.id })
                    }}
                    onSelectPhoto={(id) => dispatchAlbum({ type: 'SET_SELECTED_ID', id })}
                    onDeletedPhoto={(photoId) => dispatchAlbum({ type: 'DELETE_PHOTO', photoId })}
                    onClose={handleCloseSurface}
                    className="h-[100dvh]"
                  />
                )}
              </DrawerContent>
            </Drawer>
          ) : null}
        </div>
        {selectedCourse && !mapUI.isFullscreen && (
          <ElevationPanel
            routeGeoJSON={selectedCourse.route_geojson}
            routeRenderMetadata={selectedCourse.route_render_metadata ?? null}
            uphillSegments={uphillSegments}
            pois={localPois}
            albumPhotos={album.previewPhotos}
            courseTitle={selectedCourse.title}
            windDirection={wind.direction}
            windSpeed={wind.speed}
            windSegmentsOverride={wind.segmentsOverride}
            onHoverPointChange={setHoveredRoutePoint}
          />
        )}
      </main>
      {selectedCourse && surface.kind && surface.source !== 'bottom-sheet' ? (
        <aside className="hidden md:flex w-[360px] border-l bg-background">
          {surface.kind === 'review' ? (
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
              isLoading={album.loading}
              error={album.error}
              selectedPhotoId={album.selectedId}
              onRetry={() => dispatchAlbum({ type: 'INCREMENT_RELOAD' })}
              onUploaded={(photo) => {
                dispatchAlbum({ type: 'PREPEND_PHOTO', photo })
                dispatchAlbum({ type: 'SET_SELECTED_ID', id: photo.id })
              }}
              onSelectPhoto={(id) => dispatchAlbum({ type: 'SET_SELECTED_ID', id })}
              onDeletedPhoto={(photoId) => dispatchAlbum({ type: 'DELETE_PHOTO', photoId })}
              onClose={handleCloseSurface}
            />
          )}
        </aside>
      ) : null}
      <RegionOnboardingModal />
    </div>
  )
}
