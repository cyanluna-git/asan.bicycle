'use client'

import type { PoiMapItem } from '@/types/course'

export type PoiPlaceDetails = {
  address: string | null
  place_url: string | null
}

type PlaceSearchResult = {
  place_name: string
  address_name: string
  road_address_name: string
  place_url?: string
  x: string
  y: string
}

const detailsCache = new Map<string, PoiPlaceDetails | null>()
const pendingCache = new Map<string, Promise<PoiPlaceDetails | null>>()

function buildPoiCacheKey(poi: PoiMapItem) {
  return `${poi.id}:${poi.name}:${poi.lat}:${poi.lng}`
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadiusM = 6371000
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusM * Math.asin(Math.sqrt(a))
}

function selectBestResult(poi: PoiMapItem, results: PlaceSearchResult[]) {
  if (results.length === 0) {
    return null
  }

  const exactNameMatches = results.filter((result) => result.place_name.trim() === poi.name.trim())
  const candidates = exactNameMatches.length > 0 ? exactNameMatches : results

  return candidates.reduce((best, current) => {
    const currentLat = Number(current.y)
    const currentLng = Number(current.x)
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
      return best
    }

    const currentDistance = haversineMeters(poi.lat, poi.lng, currentLat, currentLng)
    if (!best) {
      return { result: current, distance: currentDistance }
    }

    return currentDistance < best.distance
      ? { result: current, distance: currentDistance }
      : best
  }, null as { result: PlaceSearchResult; distance: number } | null)?.result ?? null
}

export function isKakaoPlacesReady() {
  return typeof window !== 'undefined' && Boolean(window.kakao?.maps?.services)
}

export async function lookupPoiPlaceDetails(poi: PoiMapItem) {
  if (poi.address || poi.place_url) {
    return {
      address: poi.address ?? null,
      place_url: poi.place_url ?? null,
    }
  }

  if (!isKakaoPlacesReady()) {
    return null
  }

  const cacheKey = buildPoiCacheKey(poi)
  if (detailsCache.has(cacheKey)) {
    return detailsCache.get(cacheKey) ?? null
  }

  if (pendingCache.has(cacheKey)) {
    return pendingCache.get(cacheKey) ?? null
  }

  const request = new Promise<PoiPlaceDetails | null>((resolve) => {
    const places = new kakao.maps.services.Places()
    places.keywordSearch(
      poi.name,
      (results, status) => {
        if (status !== kakao.maps.services.Status.OK || !results?.length) {
          resolve(null)
          return
        }

        const best = selectBestResult(poi, results as PlaceSearchResult[])
        if (!best) {
          resolve(null)
          return
        }

        resolve({
          address: best.road_address_name || best.address_name || null,
          place_url: best.place_url ?? null,
        })
      },
      {
        x: poi.lng,
        y: poi.lat,
        radius: 500,
        size: 5,
      },
    )
  }).then((result) => {
    detailsCache.set(cacheKey, result)
    pendingCache.delete(cacheKey)
    return result
  }).catch(() => {
    detailsCache.set(cacheKey, null)
    pendingCache.delete(cacheKey)
    return null
  })

  pendingCache.set(cacheKey, request)
  return request
}
