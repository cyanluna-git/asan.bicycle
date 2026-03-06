'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileUp, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseMetadataForm } from '@/components/upload/course-metadata-form'
import { CourseRoutePreviewMap } from '@/components/upload/course-route-preview-map'
import { UphillEditor } from '@/components/upload/uphill-editor'
import {
  buildMetadataHistoryEntry,
  buildStartPointOptions,
  createEmptyPoiDraft,
  isObjectUrl,
  recommendStartPoint,
  toMetadataHistoryJson,
  type PoiDraft,
  type StartPointOption,
  type StartPointRow,
  type UploadMetadataFormData,
} from '@/lib/course-upload'
import { normalizePoiCategory } from '@/lib/poi'
import { resolveProfileEmoji } from '@/lib/profile'
import { parseGpxToGeoJSON, type ParsedGpx } from '@/lib/gpx-parser'
import { supabase } from '@/lib/supabase'
import { getUploaderDisplayName } from '@/lib/user-display-name'
import { isWithinAsan } from '@/lib/validation'
import { detectUphillSegments, type UphillSegmentDraft } from '@/lib/uphill-detection'
import type { Json } from '@/types/database'
import type { User } from '@supabase/supabase-js'

const EMPTY_FORM: UploadMetadataFormData = {
  title: '',
  description: '',
  difficulty: 'moderate',
  theme: '',
  tags: '',
  startPointId: '',
}

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [startPoints, setStartPoints] = useState<StartPointOption[]>([])
  const [recommendedStartPoint, setRecommendedStartPoint] = useState<{
    id: string
    name: string
    distanceKm: number
  } | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedGpx | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [form, setForm] = useState<UploadMetadataFormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{ title?: string; startPointId?: string }>({})
  const [uphillSegments, setUphillSegments] = useState<UphillSegmentDraft[]>([])
  const [poiDrafts, setPoiDrafts] = useState<PoiDraft[]>([])
  const [activePoiDraftId, setActivePoiDraftId] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    let cancelled = false

    const loadStartPoints = async () => {
      const { data, error } = await supabase
        .from('start_points')
        .select('id, name, location')
        .order('name')

      if (cancelled) return

      if (error) {
        console.error('[upload] start_points error:', error.message, error.details)
        return
      }

      setStartPoints(buildStartPointOptions((data ?? []) as StartPointRow[]))
    }

    void loadStartPoints()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!parsed) {
      setRecommendedStartPoint(null)
      return
    }

    const nextRecommendation = recommendStartPoint(
      parsed.startLat,
      parsed.startLng,
      startPoints,
    )
    setRecommendedStartPoint(nextRecommendation)

    setForm((prev) => {
      if (prev.startPointId || !nextRecommendation) {
        return prev
      }

      return { ...prev, startPointId: nextRecommendation.id }
    })
  }, [parsed, startPoints])

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

  const uploaderName = user ? getUploaderDisplayName(user) : '익명'

  const handleFile = useCallback(async (nextFile: File) => {
    setFile(nextFile)
    setParsed(null)
    setParseError(null)
    setValidationError(null)
    setSubmitError(null)
    setUpillAndPoiState()

    const inferredTitle = nextFile.name
      .replace(/\.gpx$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()

    setForm({
      ...EMPTY_FORM,
      title: inferredTitle,
    })
    setFormErrors({})

    try {
      const result = await parseGpxToGeoJSON(nextFile)
      if (!isWithinAsan(result.startLat, result.startLng)) {
        setValidationError(
          '출발점이 아산시 범위(20km) 밖입니다. 아산시 출발 코스만 업로드할 수 있습니다.',
        )
      }
      setParsed(result)

      if (result.elevationProfile.length > 0) {
        setUphillSegments(detectUphillSegments(result.elevationProfile))
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'GPX 파싱 오류가 발생했습니다.')
    }
  }, [])

  const setUpillAndPoiState = () => {
    setUphillSegments([])
    setPoiDrafts([])
    setActivePoiDraftId(null)
  }

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
    const nextFile = event.dataTransfer.files[0]
    if (nextFile && nextFile.name.toLowerCase().endsWith('.gpx')) {
      void handleFile(nextFile)
      return
    }

    setParseError('.gpx 파일만 업로드할 수 있습니다.')
  }, [handleFile])

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (nextFile) {
      void handleFile(nextFile)
    }
  }, [handleFile])

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
    const nextDraft = createEmptyPoiDraft()
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

    setActivePoiDraftId((prev) => (prev === id ? null : prev))
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
        || draft.lat != null
        || draft.lng != null,
      )

      if (!hasAnyInput) {
        return false
      }

      return !draft.name.trim() || draft.lat == null || draft.lng == null
    })

    setFormErrors(nextErrors)

    if (hasInvalidPoi) {
      setSubmitError('POI를 추가하려면 이름과 지도 위치를 함께 입력해주세요.')
      return false
    }

    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user || !file || !parsed || validationError) return
    if (!validateBeforeSubmit()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        setSubmitError('세션이 만료되었습니다. 다시 로그인해주세요.')
        setIsSubmitting(false)
        return
      }

      const currentUploaderName = getUploaderDisplayName(authData.user)
      const safeName = file.name.replace(/[^\w\-_.]/g, '_')
      const filePath = `${authData.user.id}/${Date.now()}_${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('gpx-files')
        .upload(filePath, file, { contentType: 'application/gpx+xml' })

      if (uploadError) {
        throw new Error(`파일 업로드 실패: ${uploadError.message}`)
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('gpx-files').getPublicUrl(filePath)

      const tags = form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

      const baseCourseInsert = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        difficulty: form.difficulty,
        distance_km: parsed.distanceKm,
        elevation_gain_m: parsed.elevationGainM,
        gpx_url: publicUrl,
        route_geojson: parsed.geojson as unknown as Json,
        created_by: authData.user.id,
        theme: form.theme.trim() || null,
        tags,
        start_point_id: form.startPointId || null,
      }

      const metadataHistory = toMetadataHistoryJson(
        buildMetadataHistoryEntry({
          actorDisplayName: currentUploaderName,
          actorUserId: authData.user.id,
          form,
          tags,
        }),
      )

      let insertResponse = await supabase
        .from('courses')
        .insert({
          ...baseCourseInsert,
          uploader_name: currentUploaderName,
          uploader_emoji: resolveProfileEmoji(authData.user),
          metadata_history: metadataHistory,
        })
        .select('id')
        .single()

      if (
        insertResponse.error
        && /(uploader_name|uploader_emoji|metadata_history)/i.test(insertResponse.error.message)
      ) {
        insertResponse = await supabase
          .from('courses')
          .insert(baseCourseInsert)
          .select('id')
          .single()
      }

      if (insertResponse.error || !insertResponse.data) {
        throw new Error(`코스 저장 실패: ${insertResponse.error?.message ?? '알 수 없는 오류'}`)
      }

      const courseId = insertResponse.data.id
      const validSegments = uphillSegments.filter((segment) => segment.start_km < segment.end_km)
      if (validSegments.length > 0) {
        const { error: segmentError } = await supabase
          .from('uphill_segments')
          .insert(
            validSegments.map((segment) => ({
              course_id: courseId,
              name: segment.name || null,
              start_km: segment.start_km,
              end_km: segment.end_km,
            })),
          )

        if (segmentError) {
          console.error('업힐 구간 저장 실패:', segmentError.message)
        }
      }

      const completePoiDrafts = poiDrafts.filter(
        (draft) => draft.name.trim() && draft.lat != null && draft.lng != null,
      )

      if (completePoiDrafts.length > 0) {
        const poiRows = []

        for (const draft of completePoiDrafts) {
          let photoUrl: string | null = null

          if (draft.photoFile) {
            const photoPath = `${authData.user.id}/${courseId}/${draft.id}_${draft.photoFile.name.replace(/[^\w\-_.]/g, '_')}`
            const { error: photoError } = await supabase.storage
              .from('poi-photos')
              .upload(photoPath, draft.photoFile, {
                contentType: draft.photoFile.type || 'image/jpeg',
              })

            if (photoError) {
              throw new Error(`POI 사진 업로드 실패: ${photoError.message}`)
            }

            photoUrl = supabase.storage.from('poi-photos').getPublicUrl(photoPath).data.publicUrl
          }

          poiRows.push({
            course_id: courseId,
            name: draft.name.trim(),
            category: normalizePoiCategory(draft.category),
            description: draft.description.trim() || null,
            photo_url: photoUrl,
            location: `SRID=4326;POINT(${draft.lng} ${draft.lat})`,
          })
        }

        const { error: poiError } = await supabase
          .from('pois')
          .insert(poiRows)

        if (poiError) {
          throw new Error(`POI 저장 실패: ${poiError.message}`)
        }
      }

      router.push(`/explore?courseId=${courseId}`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 pt-16">
        <Upload className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          코스를 업로드하려면 먼저 로그인해주세요.
          Supabase Auth를 통해 이메일 또는 소셜 로그인이 가능합니다.
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

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-24">
      <h1 className="mb-1 text-2xl font-bold">코스 업로드</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        GPX 파일을 업로드하고 메타데이터를 입력해 새로운 자전거 코스를 등록하세요.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : file
              ? 'border-green-400 bg-green-50'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx"
          className="hidden"
          onChange={onFileChange}
        />
        {file ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              다른 파일을 선택하려면 클릭하거나 드래그하세요
            </p>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">GPX 파일을 드래그하거나 클릭하여 선택</p>
            <p className="text-xs text-muted-foreground">최대 10MB, .gpx 파일만 가능</p>
          </>
        )}
      </div>

      {parseError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {parseError}
        </div>
      )}
      {validationError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {validationError}
        </div>
      )}

      {parsed && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <StatCard label="거리" value={`${parsed.distanceKm} km`} />
          <StatCard label="획득 고도" value={`${parsed.elevationGainM} m`} />
          <StatCard
            label="출발점"
            value={`${parsed.startLat.toFixed(4)}, ${parsed.startLng.toFixed(4)}`}
          />
        </div>
      )}

      {parsed && (
        <div className="mb-8 overflow-hidden rounded-xl border" style={{ height: 400 }}>
          <CourseRoutePreviewMap
            geojson={parsed.geojson}
            poiDrafts={poiDrafts}
            activePoiDraftId={activePoiDraftId}
            onPickPoiLocation={handlePoiLocationPick}
          />
        </div>
      )}

      {parsed && parsed.elevationProfile.length > 0 && (
        <div className="mb-8 rounded-xl border p-4">
          <UphillEditor
            profile={parsed.elevationProfile}
            segments={uphillSegments}
            onChange={setUphillSegments}
          />
        </div>
      )}

      {parsed && !validationError && (
        <CourseMetadataForm
          form={form}
          startPoints={startPoints}
          recommendedStartPoint={recommendedStartPoint}
          uploaderName={uploaderName}
          submitError={submitError}
          validationErrors={formErrors}
          isSubmitting={isSubmitting}
          submitLabel="코스 업로드"
          submittingLabel="업로드 중..."
          poiDrafts={poiDrafts}
          activePoiDraftId={activePoiDraftId}
          onSubmit={handleSubmit}
          onChangeForm={updateForm}
          onAddPoiDraft={addPoiDraft}
          onRemovePoiDraft={removePoiDraft}
          onChangePoiDraft={updatePoiDraft}
          onSelectPoiDraftForMap={setActivePoiDraftId}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  )
}
