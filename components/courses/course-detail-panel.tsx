'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { X, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { difficultyLabel, difficultyVariant } from '@/lib/difficulty'
import {
  calcDuration,
  SPEED_BEGINNER,
  SPEED_INTERMEDIATE,
  SPEED_ADVANCED,
} from '@/lib/calc-duration'
import type { CourseDetail, PoiMapItem } from '@/types/course'
import type { Enums } from '@/types/database'

const POI_LABEL: Record<Enums<'poi_category'>, string> = {
  cafe: '카페',
  restaurant: '식당',
  convenience_store: '편의점',
  rest_area: '쉼터',
  repair_shop: '자전거 수리',
  photo_spot: '포토스팟',
  parking: '주차',
  restroom: '화장실',
  water_fountain: '음수대',
  other: '기타',
}

const POI_EMOJI: Record<Enums<'poi_category'>, string> = {
  cafe: '☕',
  restaurant: '🍽️',
  convenience_store: '🏪',
  rest_area: '🛖',
  repair_shop: '🔧',
  photo_spot: '📸',
  parking: '🅿️',
  restroom: '🚻',
  water_fountain: '💧',
  other: '📍',
}

interface CourseDetailPanelProps {
  course: CourseDetail
  pois?: PoiMapItem[]
}

export function CourseDetailPanel({ course, pois = [] }: CourseDetailPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('courseId')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }

  const durations = [
    { label: '초심자', speed: SPEED_BEGINNER },
    { label: '초중급', speed: SPEED_INTERMEDIATE },
    { label: '중상급', speed: SPEED_ADVANCED },
  ] as const

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold leading-tight">
          {course.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -mr-2 -mt-1"
          onClick={handleClose}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Difficulty badge */}
      <div>
        <Badge variant={difficultyVariant[course.difficulty]}>
          {difficultyLabel[course.difficulty]}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>거리 {course.distance_km} km</span>
        <span>획득고도 &#8593; {course.elevation_gain_m} m</span>
      </div>

      {/* Duration section */}
      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
          예상 소요시간
        </h3>
        <div className="flex flex-col gap-1.5">
          {durations.map(({ label, speed }) => (
            <div
              key={label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">
                {calcDuration(
                  course.distance_km,
                  course.elevation_gain_m,
                  speed,
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Description */}
      {course.description && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">
            설명
          </h3>
          <p className="text-sm leading-relaxed">{course.description}</p>
        </div>
      )}

      {/* Theme & Tags */}
      {(course.theme || course.tags.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {course.theme && (
            <Badge variant="outline">{course.theme}</Badge>
          )}
          {course.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* 들릴만한 곳 */}
      {pois.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            들릴만한 곳
          </h3>
          <div className="flex flex-col gap-1">
            {pois.map((poi) => (
              <div
                key={poi.id}
                className="flex items-start gap-2 rounded-md p-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-base leading-none mt-0.5" aria-hidden>
                  {POI_EMOJI[poi.category]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight truncate">
                    {poi.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {POI_LABEL[poi.category]}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPX download */}
      {course.gpx_url ? (
        <Button asChild className="w-full">
          <a href={course.gpx_url} download>
            <Download className="mr-2 h-4 w-4" />
            GPX 다운로드
          </a>
        </Button>
      ) : (
        <Button className="w-full" disabled>
          <Download className="mr-2 h-4 w-4" />
          GPX 다운로드
        </Button>
      )}
    </div>
  )
}
