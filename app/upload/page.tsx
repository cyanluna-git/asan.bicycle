'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, FileUp, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CourseMetadataForm } from '@/components/upload/course-metadata-form'
import { CourseRoutePreviewMap } from '@/components/upload/course-route-preview-map'
import { UphillEditor } from '@/components/upload/uphill-editor'
import { signInWithGoogle } from '@/lib/auth'
import {
  buildMetadataHistoryEntry,
  buildStartPointOptions,
  recommendStartPoint,
  toMetadataHistoryJson,
  type StartPointOption,
  type StartPointRow,
  type UploadMetadataFormData,
} from '@/lib/course-upload'
import { resolveProfileEmoji } from '@/lib/profile'
import { buildRoutePreview } from '@/lib/course-route-preview'
import { parseGpxToGeoJSON, type ParsedGpx } from '@/lib/gpx-parser'
import { supabase } from '@/lib/supabase'
import { getUploaderDisplayName } from '@/lib/user-display-name'
import { detectUphillSegments, type UphillSegmentDraft } from '@/lib/uphill-detection'
import { detectRegionByPoint, type RegionInfo } from '@/lib/region-detect'
import { isValidCourseLocation } from '@/lib/validation'
import type { Json } from '@/types/database'
import type { User } from '@supabase/supabase-js'

const EMPTY_FORM: UploadMetadataFormData = {
  title: '',
  description: '',
  difficulty: 'moderate',
  surface_type: 'road',
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

  const [detectedRegion, setDetectedRegion] = useState<RegionInfo | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedGpx | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const [form, setForm] = useState<UploadMetadataFormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{ title?: string; startPointId?: string }>({})
  const [uphillSegments, setUphillSegments] = useState<UphillSegmentDraft[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const uploaderName = user ? getUploaderDisplayName(user) : '익명'

  const handleFile = useCallback(async (nextFile: File) => {
    setFile(nextFile)
    setParsed(null)
    setParseError(null)
    setValidationError(null)
    setSubmitError(null)
    setUphillSegments([])
    setDetectedRegion(null)

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
      if (!isValidCourseLocation(result.startLat, result.startLng)) {
        setValidationError(
          '한국 외 지역의 코스는 업로드할 수 없습니다.',
        )
      }
      setParsed(result)

      if (result.elevationProfile.length > 0) {
        setUphillSegments(detectUphillSegments(result.elevationProfile))
      }

      detectRegionByPoint(result.startLat, result.startLng)
        .then((region) => setDetectedRegion(region))
        .catch(() => setDetectedRegion(null))
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'GPX 파싱 오류가 발생했습니다.')
    }
  }, [])

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

  const validateBeforeSubmit = () => {
    const nextErrors: { title?: string; startPointId?: string } = {}

    if (!form.title.trim()) {
      nextErrors.title = '코스 이름은 필수입니다.'
    }

    if (startPoints.length > 0 && !form.startPointId) {
      nextErrors.startPointId = '출발 기점을 선택해주세요.'
    }

    setFormErrors(nextErrors)
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
        surface_type: form.surface_type,
        distance_km: parsed.distanceKm,
        elevation_gain_m: parsed.elevationGainM,
        gpx_url: publicUrl,
        route_geojson: parsed.geojson as unknown as Json,
        route_preview_points: buildRoutePreview(parsed.geojson) as unknown as Json,
        route_render_metadata: parsed.renderMetadata as unknown as Json,
        created_by: authData.user.id,
        theme: form.theme.trim() || null,
        tags,
        start_point_id: form.startPointId || null,
        region_id: detectedRegion?.id ?? null,
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
        && /(uploader_name|uploader_emoji|metadata_history|route_render_metadata)/i.test(insertResponse.error.message)
      ) {
        insertResponse = await supabase
          .from('courses')
          .insert({
            ...baseCourseInsert,
            route_render_metadata: undefined,
          })
          .select('id')
          .single()
      }

      if (insertResponse.error || !insertResponse.data) {
        throw new Error(`코스 저장 실패: ${insertResponse.error?.message ?? '알 수 없는 오류'}`)
      }

      const courseId = insertResponse.data.id

      // Step 1: Match famous uphills from DB (primary)
      const famousRanges: { start_km: number; end_km: number }[] = []
      const { data: matchCount, error: matchError } = await supabase
        .rpc('match_course_uphills', { p_course_id: courseId })
      if (matchError) {
        console.error('[uphill-match] non-critical error:', matchError.message)
      } else {
        console.log('[uphill-match] matched', matchCount, 'famous uphills')
        if ((matchCount ?? 0) > 0) {
          await fetch(`/api/courses/${courseId}/chart-uphills`, { method: 'POST' })
          // Fetch chart positions to use as exclusion zones
          const { data: chartData } = await supabase
            .from('course_uphills')
            .select('chart_start_km, chart_end_km')
            .eq('course_id', courseId)
            .not('chart_start_km', 'is', null)
            .not('chart_end_km', 'is', null)
          for (const row of chartData ?? []) {
            if (row.chart_start_km != null && row.chart_end_km != null) {
              famousRanges.push({ start_km: row.chart_start_km, end_km: row.chart_end_km })
            }
          }
        }
      }

      // Step 2: Save auto-detected uphills that don't overlap with famous uphills
      const OVERLAP_MARGIN_KM = 0.5
      const validSegments = uphillSegments
        .filter((segment) => segment.start_km < segment.end_km)
        .filter((seg) =>
          !famousRanges.some(
            (f) => seg.start_km < f.end_km + OVERLAP_MARGIN_KM && seg.end_km > f.start_km - OVERLAP_MARGIN_KM,
          ),
        )
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

      router.push(`/courses?focus=${courseId}`)
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
            await signInWithGoogle()
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

      {parsed ? (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <StatCard label="거리" value={`${parsed.distanceKm} km`} />
          <StatCard label="획득 고도" value={`${parsed.elevationGainM} m`} />
          <StatCard
            label="출발점"
            value={`${parsed.startLat.toFixed(4)}, ${parsed.startLng.toFixed(4)}`}
          />
        </div>
      ) : null}

      {parsed ? (
        <div className="mb-8 overflow-hidden rounded-xl border" style={{ height: 400 }}>
          <CourseRoutePreviewMap
            geojson={parsed.geojson}
            poiDrafts={[]}
          />
        </div>
      ) : null}

      {parsed && parsed.elevationProfile.length > 0 ? (
        <div className="mb-8 rounded-xl border p-4">
          <UphillEditor
            profile={parsed.elevationProfile}
            segments={uphillSegments}
            onChange={setUphillSegments}
          />
        </div>
      ) : null}

      {parsed && !validationError ? (
        <>
          <CourseMetadataForm
            form={form}
            startPoints={startPoints}
            recommendedStartPoint={recommendedStartPoint}
            detectedRegion={detectedRegion}
            uploaderName={uploaderName}
            submitError={submitError}
            validationErrors={formErrors}
            isSubmitting={isSubmitting}
            submitLabel="코스 업로드"
            submittingLabel="업로드 중..."
            onSubmit={handleSubmit}
            onChangeForm={updateForm}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            POI는 코스를 업로드한 뒤 상세 패널의 `들를만한 곳` 섹션에서 장소 검색으로 추가할 수 있습니다.
          </p>
        </>
      ) : null}
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
