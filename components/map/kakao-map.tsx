"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import {
  Map,
  ZoomControl,
  Polyline,
  CustomOverlayMap,
  useKakaoLoader,
  useMap,
} from "react-kakao-maps-sdk"
import type { CourseAlbumPhoto, CourseMapItem, RouteGeoJSON, PoiMapItem } from "@/types/course"
import type { RouteHoverPoint } from '@/lib/elevation-hover-sync'
import { getPoiMeta } from '@/lib/poi'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASAN_CENTER = { lat: 36.7797, lng: 127.004 }

/** Fallback route shown when no courses have route_geojson data. */
const SAMPLE_ROUTE: RouteGeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: [
          [127.004, 36.7797], // 아산 신정호
          [126.99, 36.8],
          [126.98, 36.81],
          [126.96, 36.85],
          [126.93, 36.88],
          [126.9, 36.92],
          [126.88, 36.95],
          [126.87, 36.96],
          [126.86, 36.98],
          [126.85, 37.0],
          [126.83, 37.02],
          [126.82, 37.04], // 공주 방향
        ],
      },
    },
  ],
}

const SAMPLE_COURSE_ID = "__sample__"

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

type LatLng = { lat: number; lng: number }

/** Convert a RouteGeoJSON into a flat array of { lat, lng } for Polyline path. */
function extractCoordinates(geojson: RouteGeoJSON): LatLng[] {
  const coords: LatLng[] = []
  for (const feature of geojson.features) {
    if (feature.geometry?.type === "LineString") {
      for (const coord of feature.geometry.coordinates) {
        coords.push({ lat: coord[1], lng: coord[0] })
      }
    }
  }
  return coords
}

/**
 * Compute SW & NE corners for kakao.maps.LatLngBounds from a coordinate array.
 * Returns null if array is empty.
 */
function computeBounds(coords: LatLng[]) {
  if (coords.length === 0) return null
  let minLat = coords[0].lat
  let maxLat = coords[0].lat
  let minLng = coords[0].lng
  let maxLng = coords[0].lng
  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat
    if (c.lat > maxLat) maxLat = c.lat
    if (c.lng < minLng) minLng = c.lng
    if (c.lng > maxLng) maxLng = c.lng
  }
  return { sw: { lat: minLat, lng: minLng }, ne: { lat: maxLat, lng: maxLng } }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POI category config
// ---------------------------------------------------------------------------

interface KakaoMapProps {
  routeQueryString?: string
  selectedCourseId?: string | null
  pois?: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
  albumPhotos?: CourseAlbumPhoto[]
  selectedAlbumPhotoId?: string | null
  onSelectAlbumPhoto?: (id: string | null) => void
  hoveredRoutePoint?: RouteHoverPoint | null
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function KakaoMap({
  routeQueryString,
  selectedCourseId,
  pois,
  selectedPoiId,
  onSelectPoi,
  albumPhotos,
  selectedAlbumPhotoId,
  onSelectAlbumPhoto,
  hoveredRoutePoint,
}: KakaoMapProps) {
  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appkey) {
    return (
      <MapError message="카카오맵 API 키가 설정되지 않았습니다. .env.local을 확인해주세요." />
    )
  }

  return (
    <KakaoMapInner
      appkey={appkey}
      routeQueryString={routeQueryString}
      selectedCourseId={selectedCourseId}
      pois={pois}
      selectedPoiId={selectedPoiId}
      onSelectPoi={onSelectPoi}
      albumPhotos={albumPhotos}
      selectedAlbumPhotoId={selectedAlbumPhotoId}
      onSelectAlbumPhoto={onSelectAlbumPhoto}
      hoveredRoutePoint={hoveredRoutePoint}
    />
  )
}

// ---------------------------------------------------------------------------
// Inner component (requires useKakaoLoader)
// ---------------------------------------------------------------------------

function KakaoMapInner({
  appkey,
  routeQueryString,
  selectedCourseId,
  pois,
  selectedPoiId,
  onSelectPoi,
  albumPhotos,
  selectedAlbumPhotoId,
  onSelectAlbumPhoto,
  hoveredRoutePoint,
}: { appkey: string } & KakaoMapProps) {
  const [loading, error] = useKakaoLoader({
    appkey,
    libraries: ["services", "clusterer"],
  })
  const [courses, setCourses] = useState<CourseMapItem[]>([])
  const [isRoutesLoading, setIsRoutesLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function loadRoutes() {
      setIsRoutesLoading(true)

      try {
        const queryString = routeQueryString ? `?${routeQueryString}` : ''
        const response = await fetch(`/api/courses/routes${queryString}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch course routes: ${response.status}`)
        }

        const payload = await response.json() as { routes?: CourseMapItem[] }
        setCourses(payload.routes ?? [])
      } catch (fetchError) {
        if ((fetchError as Error).name !== 'AbortError') {
          console.error('[kakao-map] failed to fetch routes', fetchError)
          setCourses([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsRoutesLoading(false)
        }
      }
    }

    void loadRoutes()

    return () => controller.abort()
  }, [routeQueryString])

  if (error) {
    return <MapError message="지도를 불러오는 중 오류가 발생했습니다." />
  }
  if (loading) {
    return <MapSkeleton />
  }

  const hasAnyRoute = courses.some((course) => course.route_geojson != null)
  const effectiveCourses: CourseMapItem[] = hasAnyRoute
    ? courses
    : isRoutesLoading
      ? []
      : [{ id: SAMPLE_COURSE_ID, route_geojson: SAMPLE_ROUTE }]
  const effectiveSelectedId = hasAnyRoute ? selectedCourseId : isRoutesLoading ? null : SAMPLE_COURSE_ID

  // Only show POIs when a course is selected
  const visiblePois =
    selectedCourseId
      ? (pois ?? []).filter((p) => p.course_id === selectedCourseId)
      : []

  return (
    <div
      className="relative h-full w-full [touch-action:pan-x_pan-y_pinch-zoom]"
      data-map-interaction-surface="true"
    >
      <Map center={ASAN_CENTER} style={{ width: "100%", height: "100%" }} level={8}>
        <ZoomControl position="RIGHT" />
        <RoutePolylines
          courses={effectiveCourses}
          selectedCourseId={effectiveSelectedId ?? null}
        />
        <PoiMarkers
          pois={visiblePois}
          selectedPoiId={selectedPoiId}
          onSelectPoi={onSelectPoi}
        />
        <AlbumPhotoMarkers
          photos={albumPhotos ?? []}
          selectedPhotoId={selectedAlbumPhotoId}
          onSelectPhoto={onSelectAlbumPhoto}
        />
        <HoveredRouteMarker point={hoveredRoutePoint ?? null} />
      </Map>
      {isRoutesLoading ? (
        <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
          경로 불러오는 중
        </div>
      ) : null}
    </div>
  )
}

function HoveredRouteMarker({ point }: { point: RouteHoverPoint | null }) {
  if (!point) return null

  return (
    <CustomOverlayMap
      position={{ lat: point.lat, lng: point.lng }}
      yAnchor={0.5}
      xAnchor={0.5}
      zIndex={6}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '999px',
          backgroundColor: '#f97316',
          border: '3px solid white',
          boxShadow: '0 0 0 6px rgba(249,115,22,0.18), 0 4px 10px rgba(0,0,0,0.18)',
        }}
        aria-label={`${point.distanceKm.toFixed(2)}km 지점`}
      />
    </CustomOverlayMap>
  )
}

function AlbumPhotoMarkers({
  photos,
  selectedPhotoId,
  onSelectPhoto,
}: {
  photos: CourseAlbumPhoto[]
  selectedPhotoId?: string | null
  onSelectPhoto?: (id: string | null) => void
}) {
  const map = useMap()
  const [openId, setOpenId] = useState<string | null>(selectedPhotoId ?? null)
  const geotaggedPhotos = useMemo(
    () => photos.filter((photo) => photo.lat != null && photo.lng != null),
    [photos],
  )

  useEffect(() => {
    setOpenId(selectedPhotoId ?? null)
  }, [selectedPhotoId])

  useEffect(() => {
    if (!openId) return

    const activePhoto = geotaggedPhotos.find((photo) => photo.id === openId)
    if (!activePhoto || activePhoto.lat == null || activePhoto.lng == null) return

    map.panTo(new kakao.maps.LatLng(activePhoto.lat, activePhoto.lng))
  }, [geotaggedPhotos, map, openId])

  useEffect(() => {
    if (openId && !geotaggedPhotos.some((photo) => photo.id === openId)) {
      setOpenId(null)
      onSelectPhoto?.(null)
    }
  }, [geotaggedPhotos, onSelectPhoto, openId])

  if (geotaggedPhotos.length === 0) return null

  return (
    <>
      {geotaggedPhotos.map((photo) => {
        const isOpen = openId === photo.id
        const pos = { lat: photo.lat!, lng: photo.lng! }

        return (
          <CustomOverlayMap
            key={photo.id}
            position={pos}
            yAnchor={1.1}
            xAnchor={0.5}
            zIndex={5}
          >
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  const nextId = isOpen ? null : photo.id
                  setOpenId(nextId)
                  onSelectPhoto?.(nextId)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isOpen ? 42 : 34,
                  height: isOpen ? 42 : 34,
                  borderRadius: '999px',
                  backgroundColor: '#e2e8f0',
                  backgroundImage: `url(${photo.public_url})`,
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: 'cover',
                  border: isOpen ? '3px solid white' : '2px solid white',
                  boxShadow: isOpen
                    ? '0 0 0 6px rgba(249,115,22,0.22), 0 8px 18px rgba(0,0,0,0.28)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                  transform: isOpen ? 'translateY(-2px)' : 'none',
                  transition: 'all 160ms ease',
                  overflow: 'hidden',
                }}
                aria-label={photo.caption ?? '라이드 사진'}
              />

              {isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'white',
                    borderRadius: 14,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    padding: 10,
                    width: 184,
                    zIndex: 10,
                  }}
                >
                  <div
                    aria-label={photo.caption ?? '라이드 사진'}
                    role="img"
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: '#e2e8f0',
                      backgroundImage: `url(${photo.public_url})`,
                      backgroundPosition: 'center',
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: 'cover',
                    }}
                  />
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1e293b',
                      lineHeight: 1.4,
                    }}
                  >
                    {photo.caption?.trim() || '캡션 없는 라이딩 사진'}
                  </p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 11,
                      color: '#64748b',
                    }}
                  >
                    {photo.taken_at ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(photo.taken_at)) : '촬영일 없음'}
                  </p>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -7,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '7px solid transparent',
                      borderRight: '7px solid transparent',
                      borderTop: '7px solid white',
                    }}
                  />
                </div>
              )}
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// RoutePolylines — renders inside <Map> so children can use useMap()
// ---------------------------------------------------------------------------

function RoutePolylines({
  courses,
  selectedCourseId,
}: {
  courses: CourseMapItem[]
  selectedCourseId: string | null
}) {
  // Fade-in: track opacity via state, animate strokeOpacity 0 -> target
  const [fadeOpacity, setFadeOpacity] = useState(0)

  useEffect(() => {
    // Reset to 0 on selection change, then ramp to 1
    setFadeOpacity(0)
    const raf = requestAnimationFrame(() => {
      // Use a small timeout so the browser paints at opacity 0 first
      const timer = setTimeout(() => setFadeOpacity(1), 30)
      return () => clearTimeout(timer)
    })
    return () => cancelAnimationFrame(raf)
  }, [selectedCourseId])

  const routePaths = useMemo(
    () => courses.map((course) => ({
      id: course.id,
      coords: course.route_geojson ? extractCoordinates(course.route_geojson) : [],
    })),
    [courses],
  )

  const selectedCourse = routePaths.find((course) => course.id === selectedCourseId)
  const selectedCoords = selectedCourse?.coords ?? []

  return (
    <>
      {/* Background polylines: all courses with routes (gray, thin) */}
      {routePaths.map((course) => {
        const coords = course.coords
        if (coords.length < 2) return null
        const isSelected = course.id === selectedCourseId
        return (
          <Polyline
            key={course.id}
            path={coords}
            strokeWeight={isSelected ? 4 : 2}
            strokeColor={isSelected ? "#3B82F6" : "#CCCCCC"}
            strokeOpacity={
              isSelected ? fadeOpacity : 0.6 * fadeOpacity
            }
            strokeStyle="solid"
            zIndex={isSelected ? 2 : 1}
          />
        )
      })}

      {/* Start marker: blue circle */}
      {selectedCoords.length > 0 && (
        <CustomOverlayMap
          position={selectedCoords[0]}
          yAnchor={0.5}
          xAnchor={0.5}
          zIndex={3}
        >
          <div
            className="transition-opacity duration-300 ease-in"
            style={{ opacity: fadeOpacity }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                backgroundColor: "#3B82F6",
                border: "2px solid white",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            />
          </div>
        </CustomOverlayMap>
      )}

      {/* End marker: checkered flag */}
      {selectedCoords.length > 1 && (
        <CustomOverlayMap
          position={selectedCoords[selectedCoords.length - 1]}
          yAnchor={1}
          xAnchor={0.5}
          zIndex={3}
        >
          <div
            className="transition-opacity duration-300 ease-in"
            style={{ opacity: fadeOpacity }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }} role="img" aria-label="finish">
              🏁
            </span>
          </div>
        </CustomOverlayMap>
      )}

      {/* Bounds controller */}
      <BoundsController
        selectedCoords={selectedCoords}
        selectedCourseId={selectedCourseId}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// BoundsController — auto-fit map bounds when selection changes
// ---------------------------------------------------------------------------

function BoundsController({
  selectedCoords,
  selectedCourseId,
}: {
  selectedCoords: LatLng[]
  selectedCourseId: string | null
}) {
  const map = useMap()

  const fitBounds = useCallback(() => {
    if (selectedCoords.length < 2) return
    const b = computeBounds(selectedCoords)
    if (!b) return

    const bounds = new kakao.maps.LatLngBounds(
      new kakao.maps.LatLng(b.sw.lat, b.sw.lng),
      new kakao.maps.LatLng(b.ne.lat, b.ne.lng),
    )
    map.setBounds(bounds, 50)
  }, [map, selectedCoords])

  useEffect(() => {
    fitBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId])

  return null
}

// ---------------------------------------------------------------------------
// PoiMarkers — renders POI pins + click popup inside <Map>
// ---------------------------------------------------------------------------

function PoiMarkers({
  pois,
  selectedPoiId,
  onSelectPoi,
}: {
  pois: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
}) {
  const map = useMap()
  const [openId, setOpenId] = useState<string | null>(selectedPoiId ?? null)

  useEffect(() => {
    setOpenId(selectedPoiId ?? null)
  }, [selectedPoiId])

  useEffect(() => {
    if (!openId) return

    const activePoi = pois.find((poi) => poi.id === openId)
    if (!activePoi) return

    map.panTo(new kakao.maps.LatLng(activePoi.lat, activePoi.lng))
  }, [map, openId, pois])

  useEffect(() => {
    if (openId && !pois.some((poi) => poi.id === openId)) {
      setOpenId(null)
      onSelectPoi?.(null)
    }
  }, [onSelectPoi, openId, pois])

  if (pois.length === 0) return null

  return (
    <>
      {pois.map((poi) => {
        const cfg = getPoiMeta(poi.category)
        const pos = { lat: poi.lat, lng: poi.lng }
        const isOpen = openId === poi.id

        return (
          <CustomOverlayMap
            key={poi.id}
            position={pos}
            yAnchor={1.1}
            xAnchor={0.5}
            zIndex={4}
          >
            <div style={{ position: "relative" }}>
              {/* Pin button */}
              <button
                onClick={() => {
                  const nextId = isOpen ? null : poi.id
                  setOpenId(nextId)
                  onSelectPoi?.(nextId)
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: isOpen ? 34 : 28,
                  height: isOpen ? 34 : 28,
                  borderRadius: "50%",
                  backgroundColor: cfg.color,
                  border: isOpen ? "3px solid #0f172a" : "2px solid white",
                  boxShadow: isOpen
                    ? "0 0 0 6px rgba(15,23,42,0.18), 0 6px 18px rgba(0,0,0,0.28)"
                    : "0 2px 6px rgba(0,0,0,0.35)",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  transform: isOpen ? "translateY(-2px)" : "none",
                  transition: "all 160ms ease",
                }}
                aria-label={poi.name}
              >
                {cfg.emoji}
              </button>

              {/* Popup */}
              {isOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 36,
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "white",
                    borderRadius: 10,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                    padding: "10px 12px",
                    minWidth: 180,
                    maxWidth: 240,
                    zIndex: 10,
                    whiteSpace: "normal",
                  }}
                >
                  {/* Close button */}
                  <button
                    onClick={() => setOpenId(null)}
                    style={{
                      position: "absolute",
                      top: 6,
                      right: 8,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "#94a3b8",
                      lineHeight: 1,
                    }}
                    aria-label="닫기"
                  >
                    ✕
                  </button>
                  {/* Category badge */}
                  <div style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        fontWeight: 600,
                        color: cfg.color,
                        backgroundColor: cfg.color + "18",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}
                    >
                      {cfg.emoji} {cfg.label}
                    </span>
                  </div>
                  {/* Name */}
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#1e293b",
                      lineHeight: 1.4,
                      paddingRight: 16,
                    }}
                  >
                    {poi.name}
                  </p>
                  {/* Description */}
                  {poi.description && (
                    <p
                      style={{
                        margin: "5px 0 0",
                        fontSize: 12,
                        color: "#64748b",
                        lineHeight: 1.5,
                      }}
                    >
                      {poi.description}
                    </p>
                  )}
                  {/* Arrow */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: -7,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 0,
                      height: 0,
                      borderLeft: "7px solid transparent",
                      borderRight: "7px solid transparent",
                      borderTop: "7px solid white",
                    }}
                  />
                </div>
              )}
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Skeleton & Error
// ---------------------------------------------------------------------------

function MapSkeleton() {
  return (
    <div className="flex-1 bg-muted animate-pulse flex items-center justify-center">
      <p className="text-muted-foreground text-sm">지도 로딩 중...</p>
    </div>
  )
}

function MapError({ message }: { message: string }) {
  return (
    <div className="flex-1 bg-muted flex items-center justify-center">
      <p className="text-destructive text-sm">{message}</p>
    </div>
  )
}
