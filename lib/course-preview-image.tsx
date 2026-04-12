import { ImageResponse } from 'next/og'
import type { RoutePreviewPoint } from '@/types/course'

const IMAGE_WIDTH = 600
const IMAGE_HEIGHT = 400
const PADDING = 40

export const PREVIEW_BUCKET = 'course-previews'

function computeBounds(points: RoutePreviewPoint[]): {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
} {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

function projectPoints(
  points: RoutePreviewPoint[],
  bounds: ReturnType<typeof computeBounds>,
): string {
  const drawW = IMAGE_WIDTH - PADDING * 2
  const drawH = IMAGE_HEIGHT - PADDING * 2

  const latRange = bounds.maxLat - bounds.minLat || 0.001
  const lngRange = bounds.maxLng - bounds.minLng || 0.001

  const scaleX = drawW / lngRange
  const scaleY = drawH / latRange
  const scale = Math.min(scaleX, scaleY)

  const projectedW = lngRange * scale
  const projectedH = latRange * scale
  const offsetX = PADDING + (drawW - projectedW) / 2
  const offsetY = PADDING + (drawH - projectedH) / 2

  return points
    .map((p) => {
      const x = offsetX + (p.lng - bounds.minLng) * scale
      const y = offsetY + (bounds.maxLat - p.lat) * scale
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function generatePreviewImageResponse(
  points: RoutePreviewPoint[],
): ImageResponse {
  if (points.length < 2) {
    throw new Error('At least 2 route points required')
  }

  const bounds = computeBounds(points)
  const polylinePoints = projectPoints(points, bounds)

  const startPoint = polylinePoints.split(' ')[0]
  const endPoint = polylinePoints.split(' ').at(-1)
  const [sx, sy] = (startPoint ?? '0,0').split(',').map(Number)
  const [ex, ey] = (endPoint ?? '0,0').split(',').map(Number)

  return new ImageResponse(
    (
      <div
        style={{
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          background: 'linear-gradient(135deg, #fafaf8 0%, #f0ede4 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
        >
          {/* Route outline (white) */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Route line (orange) */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#FC4C02"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Start marker */}
          <circle cx={sx} cy={sy} r="6" fill="#FC4C02" stroke="white" strokeWidth="2" />
          {/* End marker */}
          <circle cx={ex} cy={ey} r="6" fill="#3B82F6" stroke="white" strokeWidth="2" />
        </svg>
      </div>
    ),
    {
      width: IMAGE_WIDTH,
      height: IMAGE_HEIGHT,
    },
  )
}

export function previewStoragePath(courseId: string): string {
  return `${courseId}.png`
}
