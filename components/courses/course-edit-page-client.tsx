'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, Lock, LogIn, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseMetadataForm } from '@/components/upload/course-metadata-form'
import { CourseRoutePreviewMap } from '@/components/upload/course-route-preview-map'
import { UphillEditor } from '@/components/upload/uphill-editor'
import { canEditCourse, isAdminUser } from '@/lib/admin'
import {
  buildPoiDraftFromRecord,
  buildStartPointOptions,
  isObjectUrl,
  recommendStartPoint,
  type Difficulty,
  type PoiDraft,
  type StartPointOption,
  type StartPointRow,
  type UploadMetadataFormData,
} from '@/lib/course-upload'
import { normalizePoiCategory } from '@/lib/poi'
import { supabase } from '@/lib/supabase'
import { getUploaderDisplayName } from '@/lib/user-display-name'
import type { UphillSegmentDraft } from '@/lib/uphill-detection'
import type { ElevationPoint, RouteGeoJSON } from '@/types/course'
import type { User } from '@supabase/supabase-js'

interface CourseEditPageClientProps {
  courseId: string
}

type EditableCourseRow = {
  id: string
  title: string
  description: string | null
  difficulty: Difficulty
  distance_km: number
  elevation_gain_m: number
  theme: string | null
  tags: string[]
  start_point_id: string | null
  route_geojson: RouteGeoJSON | null
  created_by: string | null
  uploader_name?: string | null
}

type EditablePoiRow = {
  id: string
  name: string
  category: string | null
  description: string | null
  photo_url: string | null
  lat: number
  lng: number
}

type EditableUphillRow = {
  id: string
  name: string | null
  start_km: number
  end_km: number
}

const EMPTY_FORM: UploadMetadataFormData = {
  title: '',
  description: '',
  difficulty: 'moderate',
  theme: '',
  tags: '',
  startPointId: '',
}

const COURSE_FIELDS = 'id, title, description, difficulty, distance_km, elevation_gain_m, theme, tags, start_point_id, route_geojson, created_by, uploader_name'
const COURSE_FIELDS_FALLBACK = 'id, title, description, difficulty, distance_km, elevation_gain_m, theme, tags, start_point_id, route_geojson, created_by'

function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadiusKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function buildElevationProfile(geojson: RouteGeoJSON | null): ElevationPoint[] {
  if (!geojson) return []

  const profile: ElevationPoint[] = []
  let distanceKm = 0
  let previous: [number, number, number | undefined] | null = null

  for (const feature of geojson.features) {
    if (feature.geometry?.type !== 'LineString') continue

    for (const rawCoordinate of feature.geometry.coordinates) {
      const coordinate = rawCoordinate as [number, number, number | undefined]

      if (previous) {
        distanceKm += haversineKm(
          previous[1],
          previous[0],
          coordinate[1],
          coordinate[0],
        )
      }

      const elevation = typeof coordinate[2] === 'number'
        ? coordinate[2]
        : (profile[profile.length - 1]?.elevationM ?? 0)

      profile.push({
        distanceKm: Math.round(distanceKm * 1000) / 1000,
        elevationM: elevation,
      })

      previous = coordinate
    }
  }

  return profile
}

function toInitialForm(course: EditableCourseRow): UploadMetadataFormData {
  return {
    title: course.title,
    description: course.description ?? '',
    difficulty: course.difficulty,
    theme: course.theme ?? '',
    tags: course.tags.join(', '),
    startPointId: course.start_point_id ?? '',
  }
}

export function CourseEditPageClient({
  courseId,
}: CourseEditPageClientProps) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [course, setCourse] = useState<EditableCourseRow | null>(null)
  const [startPoints, setStartPoints] = useState<StartPointOption[]>([])
  const [recommendedStartPoint, setRecommendedStartPoint] = useState<{
    id: string
    name: string
    distanceKm: number
  } | null>(null)
  const [form, setForm] = useState<UploadMetadataFormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{ title?: string; startPointId?: string }>({})
  const [poiDrafts, setPoiDrafts] = useState<PoiDraft[]>([])
  const [activePoiDraftId, setActivePoiDraftId] = useState<string | null>(null)
  const [uphillSegments, setUphillSegments] = useState<UphillSegmentDraft[]>([])
  const latestPoiDraftsRef = useRef<PoiDraft[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }).catch(() => {
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    latestPoiDraftsRef.current = poiDrafts
  }, [poiDrafts])

  useEffect(() => {
    return () => {
      for (const draft of latestPoiDraftsRef.current) {
        const previewUrl = draft.photoPreviewUrl
        if (isObjectUrl(previewUrl)) {
          URL.revokeObjectURL(previewUrl)
        }
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setDataLoading(true)
      setLoadError(null)

      let courseData: EditableCourseRow | null = null
      let courseError: { message: string } | null = null

      const [startPointResponse, poiResponse, uphillResponse] = await Promise.all([
        supabase.from('start_points').select('id, name, location').order('name'),
        supabase
          .from('pois_with_coords')
          .select('id, name, category, description, photo_url, lat, lng')
          .eq('course_id', courseId)
          .order('category'),
        supabase
          .from('uphill_segments')
          .select('id, name, start_km, end_km')
          .eq('course_id', courseId)
          .order('start_km'),
      ])

      const courseQuery = await supabase
        .from('courses')
        .select(COURSE_FIELDS)
        .eq('id', courseId)
        .single()

      courseData = (courseQuery.data as EditableCourseRow | null) ?? null
      courseError = courseQuery.error ? { message: courseQuery.error.message } : null

      if (courseError && /uploader_name/i.test(courseError.message)) {
        const fallback = await supabase
          .from('courses')
          .select(COURSE_FIELDS_FALLBACK)
          .eq('id', courseId)
          .single()
        courseData = (fallback.data as EditableCourseRow | null) ?? null
        courseError = fallback.error ? { message: fallback.error.message } : null
      }

      if (cancelled) return

      if (courseError || !courseData) {
        setLoadError('수정할 코스를 불러오지 못했습니다.')
        setDataLoading(false)
        return
      }

      if (startPointResponse.error) {
        setLoadError('출발 기점 목록을 불러오지 못했습니다.')
        setDataLoading(false)
        return
      }

      if (poiResponse.error) {
        setLoadError('POI 정보를 불러오지 못했습니다.')
        setDataLoading(false)
        return
      }

      if (uphillResponse.error) {
        setLoadError('업힐 구간 정보를 불러오지 못했습니다.')
        setDataLoading(false)
        return
      }

      const loadedCourse = {
        ...courseData,
        uploader_name: courseData.uploader_name ?? null,
      }
      const nextStartPoints = buildStartPointOptions(
        (startPointResponse.data ?? []) as StartPointRow[],
      )
      const nextPoiDrafts = ((poiResponse.data ?? []) as EditablePoiRow[]).map((poi) =>
        buildPoiDraftFromRecord(poi),
      )
      const nextUphillSegments = ((uphillResponse.data ?? []) as EditableUphillRow[]).map(
        (segment, index) => ({
          name: segment.name ?? `업힐 ${index + 1}`,
          start_km: segment.start_km,
          end_km: segment.end_km,
        }),
      )

      setCourse(loadedCourse)
      setStartPoints(nextStartPoints)
      setForm(toInitialForm(loadedCourse))
      setPoiDrafts(nextPoiDrafts)
      setActivePoiDraftId(null)
      setUphillSegments(nextUphillSegments)

      const routeCoordinates = loadedCourse.route_geojson?.features
        .flatMap((feature) => feature.geometry?.type === 'LineString' ? feature.geometry.coordinates : []) ?? []
      const firstCoordinate = routeCoordinates[0]

      if (firstCoordinate) {
        setRecommendedStartPoint(
          recommendStartPoint(firstCoordinate[1], firstCoordinate[0], nextStartPoints),
        )
      } else {
        setRecommendedStartPoint(null)
      }

      setDataLoading(false)
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [courseId])

  const canEdit = canEditCourse({
    courseOwnerId: course?.created_by,
    userId: user?.id,
    isAdmin: isAdminUser(user),
  })

  const uploaderName = useMemo(() => {
    if (course?.uploader_name) {
      return course.uploader_name
    }

    return user ? getUploaderDisplayName(user) : '익명'
  }, [course?.uploader_name, user])

  const elevationProfile = useMemo(
    () => buildElevationProfile(course?.route_geojson ?? null),
    [course?.route_geojson],
  )

  const updateForm = <K extends keyof UploadMetadataFormData>(
    key: K,
    value: UploadMetadataFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFormErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const updatePoiDraft = <K extends keyof PoiDraft>(
    id: string,
    key: K,
    value: PoiDraft[K],
  ) => {
    setPoiDrafts((prev) => prev.map((draft) => {
      if (draft.id !== id) return draft

      if (
        key === 'photoPreviewUrl'
        && isObjectUrl(draft.photoPreviewUrl)
        && draft.photoPreviewUrl !== value
      ) {
        const previewUrl = draft.photoPreviewUrl
        URL.revokeObjectURL(previewUrl)
      }

      return { ...draft, [key]: value }
    }))
  }

  const addPoiDraft = () => {
    const nextDraft: PoiDraft = {
      id: crypto.randomUUID(),
      persistedId: null,
      name: '',
      category: 'other',
      description: '',
      lat: null,
      lng: null,
      photoUrl: null,
      photoFile: null,
      photoPreviewUrl: null,
    }

    setPoiDrafts((prev) => [...prev, nextDraft])
    setActivePoiDraftId(nextDraft.id)
  }

  const removePoiDraft = (id: string) => {
    setPoiDrafts((prev) => {
      const target = prev.find((draft) => draft.id === id)
      const previewUrl = target?.photoPreviewUrl
      if (isObjectUrl(previewUrl)) {
        URL.revokeObjectURL(previewUrl)
      }

      return prev.filter((draft) => draft.id !== id)
    })

    setActivePoiDraftId((prev) => prev === id ? null : prev)
  }

  const handlePoiLocationPick = (draftId: string, lat: number, lng: number) => {
    updatePoiDraft(draftId, 'lat', lat)
    updatePoiDraft(draftId, 'lng', lng)
  }

  const validateBeforeSubmit = () => {
    const nextErrors: { title?: string; startPointId?: string } = {}

    if (!form.title.trim()) {
      nextErrors.title = '코스 이름은 필수입니다.'
    }

    if (startPoints.length > 0 && !form.startPointId) {
      nextErrors.startPointId = '출발 기점을 선택해주세요.'
    }

    const hasInvalidPoi = poiDrafts.some((draft) => {
      const hasAnyInput = Boolean(
        draft.name.trim()
        || draft.description.trim()
        || draft.photoFile
        || draft.photoUrl
        || draft.lat != null
        || draft.lng != null,
      )

      if (!hasAnyInput) {
        return false
      }

      return !draft.name.trim() || draft.lat == null || draft.lng == null
    })

    const hasInvalidUphill = uphillSegments.some(
      (segment) => segment.start_km >= segment.end_km,
    )

    setFormErrors(nextErrors)

    if (hasInvalidPoi) {
      setSubmitError('POI를 저장하려면 이름과 지도 위치를 함께 입력해주세요.')
      return false
    }

    if (hasInvalidUphill) {
      setSubmitError('업힐 구간의 시작/종료 km 값을 확인해주세요.')
      return false
    }

    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!user || !course || !canEdit) return
    if (!validateBeforeSubmit()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.')
      }

      const tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const completePoiDrafts = poiDrafts.filter(
        (draft) => draft.name.trim() && draft.lat != null && draft.lng != null,
      )

      const poiPayload: Array<{
        id: string | null
        name: string
        category: string
        description: string | null
        lat: number
        lng: number
        photo_url: string | null
      }> = []

      for (const draft of completePoiDrafts) {
        if (draft.lat == null || draft.lng == null) {
          continue
        }

        let photoUrl = draft.photoUrl

        if (draft.photoFile) {
          const photoPath = `${user.id}/${course.id}/${draft.id}_${draft.photoFile.name.replace(/[^\w\-_.]/g, '_')}`
          const { error: photoError } = await supabase.storage
            .from('poi-photos')
            .upload(photoPath, draft.photoFile, {
              contentType: draft.photoFile.type || 'image/jpeg',
              upsert: true,
            })

          if (photoError) {
            throw new Error(`POI 사진 업로드 실패: ${photoError.message}`)
          }

          photoUrl = supabase.storage.from('poi-photos').getPublicUrl(photoPath).data.publicUrl
        }

        poiPayload.push({
          id: draft.persistedId,
          name: draft.name.trim(),
          category: normalizePoiCategory(draft.category),
          description: draft.description.trim() || null,
          lat: draft.lat,
          lng: draft.lng,
          photo_url: photoUrl,
        })
      }

      const response = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          difficulty: form.difficulty,
          theme: form.theme.trim() || null,
          tags,
          startPointId: form.startPointId || null,
          pois: poiPayload,
          uphillSegments: uphillSegments.map((segment) => ({
            name: segment.name || null,
            start_km: segment.start_km,
            end_km: segment.end_km,
          })),
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : '코스 수정 저장 중 오류가 발생했습니다.',
        )
      }

      router.push(`/explore?courseId=${course.id}`)
      router.refresh()
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : '코스 수정 저장 중 오류가 발생했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading || dataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError || !course) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 pt-16 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-bold">코스를 불러오지 못했습니다</h1>
        <p className="text-sm text-muted-foreground">
          {loadError ?? '존재하지 않거나 접근할 수 없는 코스입니다.'}
        </p>
        <Button asChild variant="outline">
          <Link href="/explore">코스 목록으로 돌아가기</Link>
        </Button>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 pt-16 text-center">
        <LogIn className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
        <p className="text-sm text-muted-foreground">
          등록한 코스를 수정하려면 먼저 로그인해주세요.
        </p>
        <Button
          onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: window.location.href },
            })
          }}
        >
          Google로 로그인
        </Button>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-4 pt-16 text-center">
        <Lock className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold">수정 권한이 없습니다</h1>
        <p className="text-sm text-muted-foreground">
          코스 소유자 또는 관리자만 이 코스를 수정할 수 있습니다.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/explore?courseId=${course.id}`}>코스 상세로 이동</Link>
          </Button>
          <Button asChild>
            <Link href="/my-courses">내 코스</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-24">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">코스 수정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            메타데이터, POI, 업힐 구간을 수정하면 즉시 공개 데이터에 반영됩니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/explore?courseId=${course.id}`}>상세 보기</Link>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="거리" value={`${course.distance_km} km`} />
        <StatCard label="획득 고도" value={`${course.elevation_gain_m} m`} />
        <StatCard
          label="기존 업로더"
          value={uploaderName}
        />
      </div>

      {course.route_geojson && (
        <div className="mb-8 overflow-hidden rounded-xl border" style={{ height: 400 }}>
          <CourseRoutePreviewMap
            geojson={course.route_geojson}
            poiDrafts={poiDrafts}
            activePoiDraftId={activePoiDraftId}
            onPickPoiLocation={handlePoiLocationPick}
          />
        </div>
      )}

      {elevationProfile.length > 0 && (
        <div className="mb-8 rounded-xl border p-4">
          <UphillEditor
            profile={elevationProfile}
            segments={uphillSegments}
            onChange={setUphillSegments}
          />
        </div>
      )}

      <CourseMetadataForm
        form={form}
        startPoints={startPoints}
        recommendedStartPoint={recommendedStartPoint}
        uploaderName={uploaderName}
        submitError={submitError}
        validationErrors={formErrors}
        isSubmitting={isSubmitting}
        submitLabel="변경 저장"
        submittingLabel="저장 중..."
        poiDrafts={poiDrafts}
        activePoiDraftId={activePoiDraftId}
        onSubmit={handleSubmit}
        onChangeForm={updateForm}
        onAddPoiDraft={addPoiDraft}
        onRemovePoiDraft={removePoiDraft}
        onChangePoiDraft={updatePoiDraft}
        onSelectPoiDraftForMap={setActivePoiDraftId}
      />

      <div className="mt-6 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Save className="h-3.5 w-3.5" />
          저장 시 즉시 반영
        </div>
        <p className="mt-1">
          변경 이력은 서버에 누적 저장되며, GPX 경로 자체는 이 화면에서 교체할 수 없습니다.
        </p>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}
