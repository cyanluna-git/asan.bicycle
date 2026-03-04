"use client"

import { Map, ZoomControl, useKakaoLoader } from "react-kakao-maps-sdk"

const ASAN_CENTER = { lat: 36.7797, lng: 127.004 }

export default function KakaoMap() {
  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appkey) {
    return (
      <MapError message="카카오맵 API 키가 설정되지 않았습니다. .env.local을 확인해주세요." />
    )
  }

  return <KakaoMapInner appkey={appkey} />
}

function KakaoMapInner({ appkey }: { appkey: string }) {
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

  return (
    <Map
      center={ASAN_CENTER}
      style={{ width: "100%", height: "100%" }}
      level={8}
    >
      <ZoomControl position="RIGHT" />
    </Map>
  )
}

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
