"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Map,
  ZoomControl,
  Polyline,
  CustomOverlayMap,
  useKakaoLoader,
  useMap,
} from "react-kakao-maps-sdk"
import type { CourseMapItem, RouteGeoJSON, PoiMapItem } from "@/types/course"
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
  courses?: CourseMapItem[]
  selectedCourseId?: string | null
  pois?: PoiMapItem[]
  selectedPoiId?: string | null
  onSelectPoi?: (id: string | null) => void
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function KakaoMap({
  courses,
  selectedCourseId,
  pois,
  selectedPoiId,
  onSelectPoi,
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
      courses={courses}
      selectedCourseId={selectedCourseId}
      pois={pois}
      selectedPoiId={selectedPoiId}
      onSelectPoi={onSelectPoi}
    />
  )
}

// ---------------------------------------------------------------------------
// Inner component (requires useKakaoLoader)
// ---------------------------------------------------------------------------

function KakaoMapInner({
  appkey,
  courses,
  selectedCourseId,
  pois,
  selectedPoiId,
  onSelectPoi,
}: { appkey: string } & KakaoMapProps) {
  const [loading, error] = useKakaoLoader({
    appkey,
    libraries: ["services", "clusterer"],
  })

  if (error) {
    return <MapError message="지도를 불러오는 중 오류가 발생했습니다." />
  }
  if (loading) {
    return <MapSkeleton />
  }

  // Determine if we should show the sample fallback:
  // all courses either have no route_geojson or the courses array is empty
  const hasAnyRoute = (courses ?? []).some((c) => c.route_geojson != null)
  const effectiveCourses: CourseMapItem[] = hasAnyRoute
    ? (courses ?? [])
    : [{ id: SAMPLE_COURSE_ID, route_geojson: SAMPLE_ROUTE }]
  const effectiveSelectedId = hasAnyRoute ? selectedCourseId : SAMPLE_COURSE_ID

  // Only show POIs when a course is selected
  const visiblePois =
    selectedCourseId
      ? (pois ?? []).filter((p) => p.course_id === selectedCourseId)
      : []

  return (
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
    </Map>
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

  const selectedCourse = courses.find((c) => c.id === selectedCourseId)
  const selectedCoords = selectedCourse?.route_geojson
    ? extractCoordinates(selectedCourse.route_geojson)
    : []

  return (
    <>
      {/* Background polylines: all courses with routes (gray, thin) */}
      {courses.map((course) => {
        if (!course.route_geojson) return null
        const coords = extractCoordinates(course.route_geojson)
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
