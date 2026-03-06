'use client'

import { ImagePlus, MapPin, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { getPoiMeta, POI_CATEGORY_ORDER } from '@/lib/poi'
import { isObjectUrl } from '@/lib/course-upload'
import type { PoiDraft } from '@/lib/course-upload'

interface PoiDraftEditorProps {
  drafts: PoiDraft[]
  activeDraftId: string | null
  onAddDraft: () => void
  onRemoveDraft: (id: string) => void
  onChangeDraft: <K extends keyof PoiDraft>(
    id: string,
    key: K,
    value: PoiDraft[K],
  ) => void
  onSelectDraftForMap: (id: string) => void
}

export function PoiDraftEditor({
  drafts,
  activeDraftId,
  onAddDraft,
  onRemoveDraft,
  onChangeDraft,
  onSelectDraftForMap,
}: PoiDraftEditorProps) {
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">POI 추가</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            선택사항입니다. POI 행에서 위치 지정을 누른 뒤 위 지도에서 클릭하면 좌표가 저장됩니다.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddDraft}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          POI 추가
        </Button>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
          등록할 POI가 없다면 그대로 업로드해도 됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft, index) => (
            <div
              key={draft.id}
              className={`rounded-xl border p-4 ${
                activeDraftId === draft.id ? 'border-primary ring-1 ring-primary/30' : ''
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">POI {index + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    위치와 이름만 입력하면 저장됩니다.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemoveDraft(draft.id)}
                  aria-label="POI 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor={`poi-name-${draft.id}`}>POI 이름</Label>
                  <input
                    id={`poi-name-${draft.id}`}
                    type="text"
                    value={draft.name}
                    onChange={(event) => onChangeDraft(draft.id, 'name', event.target.value)}
                    placeholder="예: 신정호 라이더 카페"
                    className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div>
                  <Label htmlFor={`poi-category-${draft.id}`}>카테고리</Label>
                  <select
                    id={`poi-category-${draft.id}`}
                    value={draft.category}
                    onChange={(event) => onChangeDraft(draft.id, 'category', event.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {POI_CATEGORY_ORDER.map((category) => (
                      <option key={category} value={category}>
                        {getPoiMeta(category).label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <Label htmlFor={`poi-description-${draft.id}`}>설명</Label>
                <textarea
                  id={`poi-description-${draft.id}`}
                  rows={2}
                  value={draft.description}
                  onChange={(event) => onChangeDraft(draft.id, 'description', event.target.value)}
                  placeholder="간단한 소개나 추천 포인트"
                  className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2 rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium text-foreground">선택된 위치</p>
                  <p className="text-xs text-muted-foreground">
                    {draft.lat != null && draft.lng != null
                      ? `${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)}`
                      : '아직 선택되지 않았습니다.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={activeDraftId === draft.id ? 'default' : 'outline'}
                  onClick={() => onSelectDraftForMap(draft.id)}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  위치 지정
                </Button>
              </div>

              <div className="mt-4">
                <Label htmlFor={`poi-photo-${draft.id}`}>사진</Label>
                <label
                  htmlFor={`poi-photo-${draft.id}`}
                  className="mt-1.5 flex cursor-pointer items-center justify-between rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted/30"
                >
                  <span className="truncate">
                    {draft.photoFile?.name ?? draft.photoUrl ?? '사진 업로드는 선택사항입니다'}
                  </span>
                  <span className="ml-3 inline-flex items-center text-xs font-medium text-foreground">
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                    파일 선택
                  </span>
                </label>
                <input
                  id={`poi-photo-${draft.id}`}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null
                    onChangeDraft(draft.id, 'photoFile', nextFile)
                    if (nextFile) {
                      onChangeDraft(draft.id, 'photoUrl', null)
                    }
                    onChangeDraft(
                      draft.id,
                      'photoPreviewUrl',
                      nextFile ? URL.createObjectURL(nextFile) : null,
                    )
                  }}
                />
                {draft.photoPreviewUrl && (
                  <div className="relative mt-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.photoPreviewUrl}
                      alt={draft.name || 'POI 미리보기'}
                      className="h-24 w-full rounded-lg object-cover"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      className="absolute right-2 top-2"
                      onClick={() => {
                        const previewUrl = draft.photoPreviewUrl
                        if (isObjectUrl(previewUrl)) {
                          URL.revokeObjectURL(previewUrl)
                        }
                        onChangeDraft(draft.id, 'photoFile', null)
                        onChangeDraft(draft.id, 'photoUrl', null)
                        onChangeDraft(draft.id, 'photoPreviewUrl', null)
                      }}
                      aria-label="사진 제거"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
