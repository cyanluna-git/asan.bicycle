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
import type { CourseMapItem, RouteGeoJSON } from "@/types/course"

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
      for (const [lng, lat] of feature.geometry.coordinates) {
        coords.push({ lat, lng })
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

interface KakaoMapProps {
  courses?: CourseMapItem[]
  selectedCourseId?: string | null
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function KakaoMap({ courses, selectedCourseId }: KakaoMapProps) {
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

  return (
    <Map center={ASAN_CENTER} style={{ width: "100%", height: "100%" }} level={8}>
      <ZoomControl position="RIGHT" />
      <RoutePolylines
        courses={effectiveCourses}
        selectedCourseId={effectiveSelectedId ?? null}
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
