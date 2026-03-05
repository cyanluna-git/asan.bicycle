"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Map,
  Polyline,
  CustomOverlayMap,
  useKakaoLoader,
} from "react-kakao-maps-sdk"
import { Upload, FileUp, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabase"
import { parseGpxToGeoJSON, type ParsedGpx } from "@/lib/gpx-parser"
import { isWithinAsan, ASAN_CENTER } from "@/lib/validation"
import { detectUphillSegments, type UphillSegmentDraft } from "@/lib/uphill-detection"
import { UphillEditor } from "@/components/upload/uphill-editor"
import type { RouteGeoJSON } from "@/types/course"
import type { User } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Difficulty = "easy" | "moderate" | "hard"

interface FormData {
  title: string
  description: string
  difficulty: Difficulty
  theme: string
  tags: string
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function UploadPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // GPX state
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedGpx | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState<FormData>({
    title: "",
    description: "",
    difficulty: "moderate",
    theme: "",
    tags: "",
  })

  // Uphill segments state
  const [uphillSegments, setUphillSegments] = useState<UphillSegmentDraft[]>([])

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setAuthLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Handle file selection / drop ────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setParsed(null)
    setParseError(null)
    setValidationError(null)
    setSubmitError(null)
    setUphillSegments([])

    try {
      const result = await parseGpxToGeoJSON(f)
      if (!isWithinAsan(result.startLat, result.startLng)) {
        setValidationError(
          "출발점이 아산시 범위(20km) 밖입니다. 아산시 출발 코스만 업로드할 수 있습니다.",
        )
      }
      setParsed(result)

      // Auto-detect uphill segments from elevation profile
      if (result.elevationProfile.length > 0) {
        const detected = detectUphillSegments(result.elevationProfile)
        setUphillSegments(detected)
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "GPX 파싱 오류가 발생했습니다.")
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const f = e.dataTransfer.files[0]
      if (f && f.name.toLowerCase().endsWith(".gpx")) {
        handleFile(f)
      } else {
        setParseError(".gpx 파일만 업로드할 수 있습니다.")
      }
    },
    [handleFile],
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0]
      if (f) handleFile(f)
    },
    [handleFile],
  )

  // ── Form helpers ────────────────────────────────────────────────────────
  const updateForm = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !file || !parsed || validationError) return
    if (!form.title.trim()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Re-check auth
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        setSubmitError("세션이 만료되었습니다. 다시 로그인해주세요.")
        setIsSubmitting(false)
        return
      }

      // Upload GPX file to storage
      const filePath = `${authData.user.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from("gpx-files")
        .upload(filePath, file, { contentType: "application/gpx+xml" })

      if (uploadError) {
        throw new Error(`파일 업로드 실패: ${uploadError.message}`)
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("gpx-files").getPublicUrl(filePath)

      // Insert course record
      const tags = form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      const { data: course, error: insertError } = await supabase
        .from("courses")
        .insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          difficulty: form.difficulty,
          distance_km: parsed.distanceKm,
          elevation_gain_m: parsed.elevationGainM,
          gpx_url: publicUrl,
          route_geojson: parsed.geojson as unknown as import("@/types/database").Json,
          created_by: authData.user.id,
          theme: form.theme.trim() || null,
          tags,
        })
        .select("id")
        .single()

      if (insertError) {
        throw new Error(`코스 저장 실패: ${insertError.message}`)
      }

      // Insert uphill segments (if any)
      const validSegments = uphillSegments.filter((s) => s.start_km < s.end_km)
      if (validSegments.length > 0) {
        const { error: segError } = await supabase
          .from("uphill_segments")
          .insert(
            validSegments.map((s) => ({
              course_id: course.id,
              name: s.name || null,
              start_km: s.start_km,
              end_km: s.end_km,
            })),
          )
        if (segError) {
          console.error("업힐 구간 저장 실패:", segError.message)
        }
      }

      router.push(`/explore?courseId=${course.id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Auth loading / guard ────────────────────────────────────────────────
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
        <p className="text-sm text-muted-foreground text-center max-w-md">
          코스를 업로드하려면 먼저 로그인해주세요.
          Supabase Auth를 통해 이메일 또는 소셜 로그인이 가능합니다.
        </p>
        <Button
          onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.href },
            })
          }}
        >
          Google로 로그인
        </Button>
      </div>
    )
  }

  // ── Main upload UI ──────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-24">
      <h1 className="mb-1 text-2xl font-bold">코스 업로드</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        GPX 파일을 업로드하여 새로운 자전거 코스를 등록하세요.
      </p>

      {/* ── Drop zone ─────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : file
              ? "border-green-400 bg-green-50"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
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

      {/* Parse / validation errors */}
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

      {/* ── Route stats ──────────────────────────────────────────────── */}
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

      {/* ── Map preview ──────────────────────────────────────────────── */}
      {parsed && (
        <div className="mb-8 overflow-hidden rounded-xl border" style={{ height: 400 }}>
          <RoutePreviewMap geojson={parsed.geojson} />
        </div>
      )}

      {/* ── Elevation / Uphill editor ────────────────────────────────── */}
      {parsed && parsed.elevationProfile.length > 0 && (
        <div className="mb-8 rounded-xl border p-4">
          <UphillEditor
            profile={parsed.elevationProfile}
            segments={uphillSegments}
            onChange={setUphillSegments}
          />
        </div>
      )}

      {/* ── Form ─────────────────────────────────────────────────────── */}
      {parsed && !validationError && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <Label htmlFor="title">
              코스 이름 <span className="text-red-500">*</span>
            </Label>
            <input
              id="title"
              type="text"
              required
              value={form.title}
              onChange={(e) => updateForm("title", e.target.value)}
              placeholder="예: 아산 신정호 순환 코스"
              className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">설명</Label>
            <textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => updateForm("description", e.target.value)}
              placeholder="코스에 대한 간단한 설명을 작성하세요"
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Difficulty */}
          <div>
            <Label htmlFor="difficulty">난이도</Label>
            <select
              id="difficulty"
              value={form.difficulty}
              onChange={(e) => updateForm("difficulty", e.target.value as Difficulty)}
              className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="easy">초급 (Easy)</option>
              <option value="moderate">중급 (Moderate)</option>
              <option value="hard">고급 (Hard)</option>
            </select>
          </div>

          {/* Theme */}
          <div>
            <Label htmlFor="theme">테마</Label>
            <input
              id="theme"
              type="text"
              value={form.theme}
              onChange={(e) => updateForm("theme", e.target.value)}
              placeholder="예: 벚꽃 라이딩, 카페 투어"
              className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Tags */}
          <div>
            <Label htmlFor="tags">태그</Label>
            <input
              id="tags"
              type="text"
              value={form.tags}
              onChange={(e) => updateForm("tags", e.target.value)}
              placeholder="쉼표로 구분 (예: 평지, 자전거길, 가족)"
              className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {submitError}
            </div>
          )}

          {/* Submit */}
          <Button type="submit" disabled={isSubmitting || !form.title.trim()} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                코스 업로드
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Route preview map
// ---------------------------------------------------------------------------

function RoutePreviewMap({ geojson }: { geojson: RouteGeoJSON }) {
  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
  if (!appkey) {
    return (
      <div className="flex h-full items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">카카오맵 API 키가 설정되지 않았습니다.</p>
      </div>
    )
  }
  return <RoutePreviewMapInner appkey={appkey} geojson={geojson} />
}

function RoutePreviewMapInner({
  appkey,
  geojson,
}: {
  appkey: string
  geojson: RouteGeoJSON
}) {
  const [loading, error] = useKakaoLoader({
    appkey,
    libraries: ["services"],
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

  // Extract coordinates (handle 2D and 3D coords)
  const coords: { lat: number; lng: number }[] = []
  for (const feature of geojson.features) {
    if (feature.geometry?.type === "LineString") {
      for (const coord of feature.geometry.coordinates) {
        coords.push({ lat: coord[1], lng: coord[0] })
      }
    }
  }

  // Compute center (simple average)
  const center =
    coords.length > 0
      ? {
          lat: coords.reduce((s, c) => s + c.lat, 0) / coords.length,
          lng: coords.reduce((s, c) => s + c.lng, 0) / coords.length,
        }
      : ASAN_CENTER

  return (
    <Map center={center} style={{ width: "100%", height: "100%" }} level={8}>
      {coords.length >= 2 && (
        <Polyline
          path={coords}
          strokeWeight={4}
          strokeColor="#3B82F6"
          strokeOpacity={0.9}
          strokeStyle="solid"
        />
      )}
      {/* Start marker */}
      {coords.length > 0 && (
        <CustomOverlayMap position={coords[0]} yAnchor={0.5} xAnchor={0.5} zIndex={3}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#22C55E",
              border: "2px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          />
        </CustomOverlayMap>
      )}
      {/* End marker */}
      {coords.length > 1 && (
        <CustomOverlayMap
          position={coords[coords.length - 1]}
          yAnchor={0.5}
          xAnchor={0.5}
          zIndex={3}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              backgroundColor: "#EF4444",
              border: "2px solid white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          />
        </CustomOverlayMap>
      )}
      <BoundsAdjuster coords={coords} />
    </Map>
  )
}

// ---------------------------------------------------------------------------
// Auto-fit bounds helper (runs inside Map context)
// ---------------------------------------------------------------------------

function BoundsAdjuster({ coords }: { coords: { lat: number; lng: number }[] }) {
  // We use a dynamic import approach to avoid issues — useMap must be inside <Map>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useMap } = require("react-kakao-maps-sdk") as typeof import("react-kakao-maps-sdk")
  const map = useMap()

  useEffect(() => {
    if (coords.length < 2) return
    const bounds = new kakao.maps.LatLngBounds()
    for (const c of coords) {
      bounds.extend(new kakao.maps.LatLng(c.lat, c.lng))
    }
    map.setBounds(bounds, 50)
  }, [map, coords])

  return null
}
