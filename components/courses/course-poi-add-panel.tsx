'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ImagePlus, Loader2, MapPin, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { POI_CATEGORY_ORDER, getPoiMeta, suggestPoiCategoryFromSearch, type PoiCategory } from '@/lib/poi'
import { signInWithGoogle } from '@/lib/auth'
import { POI_PHOTO_BUCKET } from '@/lib/poi-photo-storage'
import { isKakaoPlacesReady } from '@/lib/use-poi-place-details'
import { supabase } from '@/lib/supabase'
import type { PoiMapItem } from '@/types/course'

type CoursePoiAddPanelProps = {
  courseId: string
  onCreated?: (poi: PoiMapItem) => void
}

type PlaceSearchResult = {
  id: string
  place_name: string
  address_name: string
  road_address_name: string
  category_name: string
  place_url: string
  x: string
  y: string
}

const CATEGORY_OPTIONS = POI_CATEGORY_ORDER.map((category) => ({
  value: category,
  label: getPoiMeta(category).label,
}))

export function CoursePoiAddPanel({
  courseId,
  onCreated,
}: CoursePoiAddPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-full px-3"
        onClick={() => setIsOpen(true)}
        aria-label="POI 추가"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        추가
      </Button>
    )
  }

  return (
    <CoursePoiAddForm
      courseId={courseId}
      onCancel={() => setIsOpen(false)}
      onCreated={(poi) => {
        onCreated?.(poi)
        setIsOpen(false)
      }}
    />
  )
}

function CoursePoiAddForm({
  courseId,
  onCancel,
  onCreated,
}: {
  courseId: string
  onCancel: () => void
  onCreated?: (poi: PoiMapItem) => void
}) {
  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appkey) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            카카오맵 API 키가 없어 장소 검색을 열 수 없습니다.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-full px-3"
            onClick={onCancel}
          >
            닫기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <CoursePoiAddLoadedForm
      courseId={courseId}
      onCancel={onCancel}
      onCreated={onCreated}
    />
  )
}

function CoursePoiAddLoadedForm({
  courseId,
  onCancel,
  onCreated,
}: {
  courseId: string
  onCancel: () => void
  onCreated?: (poi: PoiMapItem) => void
}) {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<PlaceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceSearchResult | null>(null)
  const [category, setCategory] = useState<PoiCategory>('other')
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedPlaceAddress = useMemo(() => {
    if (!selectedPlace) {
      return ''
    }

    return selectedPlace.road_address_name || selectedPlace.address_name || '주소 정보 없음'
  }, [selectedPlace])

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl)
      }
    }
  }, [photoPreviewUrl])

  const handleSearch = async () => {
    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword) {
      setError('상호나 명소 이름을 입력해주세요.')
      setResults([])
      setSelectedPlace(null)
      return
    }

    if (!isKakaoPlacesReady()) {
      setError('카카오 장소 검색이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    setSearching(true)
    setError(null)
    setSelectedPlace(null)

    try {
      const places = new kakao.maps.services.Places()
      const data = await new Promise<PlaceSearchResult[]>((resolve, reject) => {
        places.keywordSearch(trimmedKeyword, (searchResults, status) => {
          if (status === kakao.maps.services.Status.OK) {
            resolve((searchResults ?? []) as PlaceSearchResult[])
            return
          }

          if (status === kakao.maps.services.Status.ZERO_RESULT) {
            resolve([])
            return
          }

          reject(new Error('장소 검색 중 오류가 발생했습니다.'))
        })
      })

      setResults(data)
      if (data.length === 0) {
        setError('검색 결과가 없습니다. 다른 키워드로 다시 시도해주세요.')
      }
    } catch (searchError) {
      setResults([])
      setError(
        searchError instanceof Error
          ? searchError.message
          : '장소 검색 중 오류가 발생했습니다.',
      )
    } finally {
      setSearching(false)
    }
  }

  const handleSelectPlace = (place: PlaceSearchResult) => {
    setSelectedPlace(place)
    setCategory(suggestPoiCategoryFromSearch(place.category_name))
    setError(null)
  }

  const handleSave = async () => {
    if (!selectedPlace) {
      setError('먼저 추가할 장소를 선택해주세요.')
      return
    }

    const lat = Number(selectedPlace.y)
    const lng = Number(selectedPlace.x)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('선택한 장소의 좌표 정보가 올바르지 않습니다.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        await signInWithGoogle()
        throw new Error('로그인 후 다시 시도해주세요.')
      }

      let photoPath: string | null = null
      let photoUrl: string | null = null

      if (photoFile) {
        const safeName = photoFile.name.replace(/[^\w\-_.]/g, '_')
        photoPath = `${session.user.id}/${courseId}/poi-${Date.now()}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(POI_PHOTO_BUCKET)
          .upload(photoPath, photoFile, {
            contentType: photoFile.type || 'image/jpeg',
            upsert: true,
          })

        if (uploadError) {
          throw new Error(`POI 사진 업로드 실패: ${uploadError.message}`)
        }

        photoUrl = supabase.storage.from(POI_PHOTO_BUCKET).getPublicUrl(photoPath).data.publicUrl
      }

      const response = await fetch(`/api/courses/${courseId}/pois`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: selectedPlace.place_name,
          category,
          description: description.trim() || null,
          photoPath,
          photoUrl,
          lat,
          lng,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'POI를 저장하지 못했습니다.',
        )
      }

      if (payload?.poi) {
        onCreated?.({
          ...(payload.poi as PoiMapItem),
          address: selectedPlaceAddress,
          place_url: selectedPlace.place_url ?? null,
          photo_url: photoUrl ?? (payload.poi as PoiMapItem).photo_url ?? null,
        })
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'POI를 저장하지 못했습니다.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-dashed bg-muted/20 p-3">
      <div className="flex min-w-0 flex-col gap-2">
        <input
          type="search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleSearch()
            }
          }}
          placeholder="상호나 명소 이름 검색"
          className="h-10 min-w-0 w-full rounded-full border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-10 rounded-full"
            onClick={() => void handleSearch()}
            disabled={searching || !keyword.trim()}
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            검색
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-10 rounded-full px-3"
            onClick={onCancel}
          >
            닫기
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          카카오 장소 검색 결과에서 선택한 뒤 카테고리와 설명을 보정해서 저장합니다.
        </p>
      )}

      {results.length > 0 ? (
        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
          {results.map((place) => {
            const isSelected = selectedPlace?.id === place.id
            return (
              <button
                key={place.id}
                type="button"
                className={`w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                  isSelected
                    ? 'border-foreground bg-background shadow-sm'
                    : 'border-border/70 bg-background/70 hover:bg-background'
                }`}
                onClick={() => handleSelectPlace(place)}
              >
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {place.place_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {place.road_address_name || place.address_name}
                    </p>
                    {place.category_name ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {place.category_name}
                      </p>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}

      {selectedPlace ? (
      <div className="mt-3 rounded-2xl border bg-background p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {selectedPlace.place_name}
            </p>
            <p className="text-xs text-muted-foreground">{selectedPlaceAddress}</p>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <div>
              <label
                htmlFor="poi-category"
                className="text-xs font-medium text-muted-foreground"
              >
                카테고리
              </label>
              <select
                id="poi-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as PoiCategory)}
                className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="poi-description"
                className="text-xs font-medium text-muted-foreground"
              >
                설명
              </label>
              <textarea
                id="poi-description"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="짧은 추천 포인트를 남겨주세요"
                className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="mt-3">
            <label
              htmlFor="poi-photo-upload"
              className="text-xs font-medium text-muted-foreground"
            >
              사진
            </label>
            <label
              htmlFor="poi-photo-upload"
              className="mt-1.5 flex cursor-pointer items-center justify-between rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted/30"
            >
              <span className="truncate">
                {photoFile?.name ?? '사진 업로드는 선택사항입니다'}
              </span>
              <span className="ml-3 inline-flex items-center text-xs font-medium text-foreground">
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                파일 선택
              </span>
            </label>
            <input
              id="poi-photo-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                if (photoPreviewUrl) {
                  URL.revokeObjectURL(photoPreviewUrl)
                }
                setPhotoFile(nextFile)
                setPhotoPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null)
              }}
            />
            {photoPreviewUrl ? (
              <div className="relative mt-3 overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreviewUrl}
                  alt="POI 사진 미리보기"
                  className="h-28 w-full object-cover"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute right-2 top-2"
                  onClick={() => {
                    URL.revokeObjectURL(photoPreviewUrl)
                    setPhotoFile(null)
                    setPhotoPreviewUrl(null)
                  }}
                  aria-label="POI 사진 제거"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              className="h-10 rounded-full px-4"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              저장
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
