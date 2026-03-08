'use client'

import { useEffect } from 'react'
import {
  CustomOverlayMap,
  Map,
  Polyline,
  useKakaoLoader,
  useMap,
} from 'react-kakao-maps-sdk'
import { cn } from '@/lib/utils'
import type { RoutePreviewPoint } from '@/types/course'

const ASAN_CENTER = { lat: 36.7797, lng: 127.004 }

interface CourseRouteSnapshotProps {
  points: RoutePreviewPoint[]
  className?: string
}

export function CourseRouteSnapshot({
  points,
  className,
}: CourseRouteSnapshotProps) {
  const [loading, error] = useKakaoLoader({
    appkey: process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? '',
  })
  const canRenderMap =
    Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_KEY) &&
    !loading &&
    !error &&
    points.length > 1

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-black/5 bg-[linear-gradient(180deg,_rgba(248,248,246,0.98),_rgba(255,255,255,0.98))]',
        className,
      )}
    >
      {canRenderMap ? (
        <Map
          center={points[0] ?? ASAN_CENTER}
          style={{ width: '100%', height: '100%' }}
          level={8}
          draggable={false}
          zoomable={false}
          scrollwheel={false}
          disableDoubleClick
          disableDoubleClickZoom
          keyboardShortcuts={false}
          tileAnimation={false}
        >
          <Polyline
            path={points}
            strokeWeight={5}
            strokeColor="#FFFFFF"
            strokeOpacity={0.98}
            strokeStyle="solid"
          />
          <Polyline
            path={points}
            strokeWeight={3}
            strokeColor="#FC4C02"
            strokeOpacity={0.98}
            strokeStyle="solid"
          />

          <CustomOverlayMap position={points[0]} xAnchor={0.5} yAnchor={0.5} zIndex={3}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FC4C02] shadow-[0_1px_6px_rgba(0,0,0,0.28)]" />
          </CustomOverlayMap>
          <CustomOverlayMap position={points[points.length - 1]} xAnchor={0.5} yAnchor={0.5} zIndex={3}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2563EB] shadow-[0_1px_6px_rgba(0,0,0,0.28)]" />
          </CustomOverlayMap>

          <RouteSnapshotViewport points={points} />
        </Map>
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(239,242,245,0.96),_rgba(247,248,250,0.98))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.14),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_80%_35%,_rgba(34,197,94,0.12),_transparent_22%)]" />
          <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" fill="none">
            <g stroke="rgba(15,23,42,0.06)" strokeWidth="0.8">
              <path d="M6 20H94" />
              <path d="M6 50H94" />
              <path d="M6 80H94" />
              <path d="M18 6V94" />
              <path d="M44 6V94" />
              <path d="M70 6V94" />
            </g>
            <path
              d="M4 76C18 70 26 58 38 56C47 54 56 60 66 56C76 52 86 40 96 22"
              stroke="rgba(59,130,246,0.16)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M12 10C27 18 36 30 43 43C52 58 59 72 84 86"
              stroke="rgba(249,115,22,0.1)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeDasharray="3 4"
            />
          </svg>
          <div className="absolute inset-0 bg-white/18" />
        </>
      )}
    </div>
  )
}

function RouteSnapshotViewport({
  points,
}: {
  points: RoutePreviewPoint[]
}) {
  const map = useMap()

  useEffect(() => {
    if (points.length < 2) {
      return
    }

    const bounds = new kakao.maps.LatLngBounds()
    for (const point of points) {
      bounds.extend(new kakao.maps.LatLng(point.lat, point.lng))
    }

    map.setBounds(bounds, 18, 18, 18, 18)
  }, [map, points])

  return null
}
