'use client'

import { AlertCircle, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type {
  Difficulty,
  StartPointOption,
  UploadMetadataFormData,
} from '@/lib/course-upload'

interface CourseMetadataFormProps {
  form: UploadMetadataFormData
  startPoints: StartPointOption[]
  recommendedStartPoint:
    | { id: string; name: string; distanceKm: number }
    | null
  uploaderName: string
  submitError: string | null
  validationErrors: {
    title?: string
    startPointId?: string
  }
  isSubmitting: boolean
  submitLabel?: string
  submittingLabel?: string
  onSubmit: (event: React.FormEvent) => void
  onChangeForm: <K extends keyof UploadMetadataFormData>(
    key: K,
    value: UploadMetadataFormData[K],
  ) => void
}

const DIFFICULTY_OPTIONS: Array<{ value: Difficulty; label: string }> = [
  { value: 'easy', label: '초급 (Easy)' },
  { value: 'moderate', label: '중급 (Moderate)' },
  { value: 'hard', label: '고급 (Hard)' },
]

export function CourseMetadataForm({
  form,
  startPoints,
  recommendedStartPoint,
  uploaderName,
  submitError,
  validationErrors,
  isSubmitting,
  submitLabel = '코스 저장',
  submittingLabel = '저장 중...',
  onSubmit,
  onChangeForm,
}: CourseMetadataFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-xl border bg-muted/20 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">업로더</p>
        <p className="mt-1 text-sm font-medium">{uploaderName}</p>
      </div>

      <div>
        <Label htmlFor="title">
          코스 이름 <span className="text-red-500">*</span>
        </Label>
        <input
          id="title"
          type="text"
          required
          value={form.title}
          onChange={(event) => onChangeForm('title', event.target.value)}
          placeholder="예: 남한강 자전거길 100km"
          className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {validationErrors.title && (
          <p className="mt-1 text-xs text-destructive">{validationErrors.title}</p>
        )}
      </div>

      <div>
        <Label htmlFor="description">설명</Label>
        <textarea
          id="description"
          rows={3}
          value={form.description}
          onChange={(event) => onChangeForm('description', event.target.value)}
          placeholder="코스에 대한 간단한 설명을 작성하세요"
          className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label htmlFor="difficulty">
            난이도 <span className="text-red-500">*</span>
          </Label>
          <select
            id="difficulty"
            value={form.difficulty}
            onChange={(event) => onChangeForm('difficulty', event.target.value as Difficulty)}
            className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="start-point">
            출발 기점 {startPoints.length > 0 && <span className="text-red-500">*</span>}
          </Label>
          <select
            id="start-point"
            value={form.startPointId}
            onChange={(event) => onChangeForm('startPointId', event.target.value)}
            className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">
              {startPoints.length > 0 ? '출발 기점을 선택하세요' : '등록된 출발 기점이 없습니다'}
            </option>
            {startPoints.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {recommendedStartPoint && (
            <p className="mt-1 text-xs text-muted-foreground">
              자동 추천: {recommendedStartPoint.name}
              {recommendedStartPoint.distanceKm > 0 && ` (${recommendedStartPoint.distanceKm.toFixed(1)}km)`}
            </p>
          )}
          {validationErrors.startPointId && (
            <p className="mt-1 text-xs text-destructive">
              {validationErrors.startPointId}
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="theme">테마</Label>
        <input
          id="theme"
          type="text"
          value={form.theme}
          onChange={(event) => onChangeForm('theme', event.target.value)}
          placeholder="예: 벚꽃 라이딩, 카페 투어"
          className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div>
        <Label htmlFor="tags">태그</Label>
        <input
          id="tags"
          type="text"
          value={form.tags}
          onChange={(event) => onChangeForm('tags', event.target.value)}
          placeholder="쉼표로 구분 (예: 평지, 자전거길, 가족)"
          className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {submitError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {submitError}
        </div>
      )}

      <Button type="submit" disabled={isSubmitting || !form.title.trim()} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {submittingLabel}
          </>
        ) : (
          <>
            <Upload className="mr-2 h-4 w-4" />
            {submitLabel}
          </>
        )}
      </Button>
    </form>
  )
}
