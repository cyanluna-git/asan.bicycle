'use client'

import { useEffect } from 'react'
import {
  CustomOverlayMap,
  Map,
  Polyline,
  useKakaoLoader,
  useMap,
} from 'react-kakao-maps-sdk'
import { getPoiMeta } from '@/lib/poi'
import { ASAN_CENTER } from '@/lib/validation'
import type { PoiDraft } from '@/lib/course-upload'
import type { RouteGeoJSON } from '@/types/course'

interface CourseRoutePreviewMapProps {
  geojson: RouteGeoJSON
  poiDrafts: PoiDraft[]
  activePoiDraftId: string | null
  onPickPoiLocation?: (draftId: string, lat: number, lng: number) => void
}

export function CourseRoutePreviewMap({
  geojson,
  poiDrafts,
  activePoiDraftId,
  onPickPoiLocation,
}: CourseRoutePreviewMapProps) {
  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appkey) {
    return (
      <div className="flex h-full items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">카카오맵 API 키가 설정되지 않았습니다.</p>
      </div>
    )
  }

  return (
    <CourseRoutePreviewMapInner
      appkey={appkey}
      geojson={geojson}
      poiDrafts={poiDrafts}
      activePoiDraftId={activePoiDraftId}
      onPickPoiLocation={onPickPoiLocation}
    />
  )
}

function CourseRoutePreviewMapInner({
  appkey,
  geojson,
  poiDrafts,
  activePoiDraftId,
  onPickPoiLocation,
}: CourseRoutePreviewMapProps & { appkey: string }) {
  const [loading, error] = useKakaoLoader({
    appkey,
    libraries: ['services'],
  })

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-muted">
        <p className="text-sm text-destructive">지도 로드 오류</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full animate-pulse items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">지도 로딩 중...</p>
      </div>
    )
  }

  const coords: { lat: number; lng: number }[] = []
  for (const feature of geojson.features) {
    if (feature.geometry?.type === 'LineString') {
      for (const coord of feature.geometry.coordinates) {
        coords.push({ lat: coord[1], lng: coord[0] })
      }
    }
  }

  const center = coords[0] ?? ASAN_CENTER

  return (
    <Map
      center={center}
      style={{ width: '100%', height: '100%' }}
      level={7}
      onClick={(_, mouseEvent) => {
        if (!activePoiDraftId || !onPickPoiLocation) return

        onPickPoiLocation(
          activePoiDraftId,
          mouseEvent.latLng.getLat(),
          mouseEvent.latLng.getLng(),
        )
      }}
    >
      {coords.length > 1 && (
        <Polyline
          path={coords}
          strokeWeight={4}
          strokeColor="#3B82F6"
          strokeOpacity={0.9}
          strokeStyle="solid"
        />
      )}

      {coords.length > 0 && (
        <>
          <CustomOverlayMap position={coords[0]} yAnchor={0.5} xAnchor={0.5} zIndex={3}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                backgroundColor: '#3B82F6',
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </CustomOverlayMap>
          <CustomOverlayMap position={coords[coords.length - 1]} yAnchor={1} xAnchor={0.5} zIndex={3}>
            <span style={{ fontSize: 20, lineHeight: 1 }} role="img" aria-label="finish">
              🏁
            </span>
          </CustomOverlayMap>
        </>
      )}

      {poiDrafts
        .filter((draft) => draft.lat != null && draft.lng != null)
        .map((draft) => {
          const meta = getPoiMeta(draft.category)
          const isActive = draft.id === activePoiDraftId

          return (
            <CustomOverlayMap
              key={draft.id}
              position={{ lat: draft.lat as number, lng: draft.lng as number }}
              yAnchor={1}
              xAnchor={0.5}
              zIndex={isActive ? 5 : 4}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: isActive ? 34 : 28,
                  height: isActive ? 34 : 28,
                  borderRadius: '50%',
                  backgroundColor: meta.color,
                  border: isActive ? '3px solid #0f172a' : '2px solid white',
                  boxShadow: isActive
                    ? '0 0 0 6px rgba(15,23,42,0.12), 0 4px 12px rgba(0,0,0,0.22)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  color: 'white',
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                {meta.emoji}
              </div>
            </CustomOverlayMap>
          )
        })}

      <RouteBoundsController selectedCoords={coords} />
    </Map>
  )
}

function RouteBoundsController({
  selectedCoords,
}: {
  selectedCoords: Array<{ lat: number; lng: number }>
}) {
  const map = useMap()

  useEffect(() => {
    if (selectedCoords.length < 2) return

    const bounds = new kakao.maps.LatLngBounds()
    for (const coord of selectedCoords) {
      bounds.extend(new kakao.maps.LatLng(coord.lat, coord.lng))
    }
    map.setBounds(bounds, 50)
  }, [map, selectedCoords])

  return null
}
