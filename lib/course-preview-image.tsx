import React from 'react'
import { ImageResponse } from 'next/og'
import type { RoutePreviewPoint } from '@/types/course'

const IMAGE_WIDTH = 600
const IMAGE_HEIGHT = 400
const TILE_SIZE = 256
const ROUTE_PADDING = 48

export const PREVIEW_BUCKET = 'course-previews'

// CartoDB Positron (light) — free, no API key
const TILE_URL = 'https://a.basemaps.cartocdn.com/light_all'

interface Bounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

function computeBounds(points: RoutePreviewPoint[]): Bounds {
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

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom) * TILE_SIZE
}

function latToWorldY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, zoom) *
    TILE_SIZE
  )
}

function fitZoom(bounds: Bounds): number {
  for (let z = 15; z >= 1; z--) {
    const x1 = lngToWorldX(bounds.minLng, z)
    const x2 = lngToWorldX(bounds.maxLng, z)
    const y1 = latToWorldY(bounds.maxLat, z)
    const y2 = latToWorldY(bounds.minLat, z)

    if (
      x2 - x1 <= IMAGE_WIDTH - ROUTE_PADDING * 2 &&
      y2 - y1 <= IMAGE_HEIGHT - ROUTE_PADDING * 2
    ) {
      return z
    }
  }
  return 1
}

interface TileInfo {
  x: number
  y: number
  screenX: number
  screenY: number
}

function computeTilesAndViewport(
  bounds: Bounds,
  zoom: number,
): { tiles: TileInfo[]; viewLeft: number; viewTop: number } {
  const centerLng = (bounds.minLng + bounds.maxLng) / 2
  const centerLat = (bounds.minLat + bounds.maxLat) / 2
  const centerWX = lngToWorldX(centerLng, zoom)
  const centerWY = latToWorldY(centerLat, zoom)

  const viewLeft = centerWX - IMAGE_WIDTH / 2
  const viewTop = centerWY - IMAGE_HEIGHT / 2
  const viewRight = viewLeft + IMAGE_WIDTH
  const viewBottom = viewTop + IMAGE_HEIGHT

  const tileXMin = Math.floor(viewLeft / TILE_SIZE)
  const tileXMax = Math.floor(viewRight / TILE_SIZE)
  const tileYMin = Math.floor(viewTop / TILE_SIZE)
  const tileYMax = Math.floor(viewBottom / TILE_SIZE)

  const tiles: TileInfo[] = []
  for (let tx = tileXMin; tx <= tileXMax; tx++) {
    for (let ty = tileYMin; ty <= tileYMax; ty++) {
      tiles.push({
        x: tx,
        y: ty,
        screenX: tx * TILE_SIZE - viewLeft,
        screenY: ty * TILE_SIZE - viewTop,
      })
    }
  }

  return { tiles, viewLeft, viewTop }
}

function projectPointsToScreen(
  points: RoutePreviewPoint[],
  zoom: number,
  viewLeft: number,
  viewTop: number,
): string {
  return points
    .map((p) => {
      const x = lngToWorldX(p.lng, zoom) - viewLeft
      const y = latToWorldY(p.lat, zoom) - viewTop
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
  const zoom = fitZoom(bounds)
  const { tiles, viewLeft, viewTop } = computeTilesAndViewport(bounds, zoom)
  const polylinePoints = projectPointsToScreen(points, zoom, viewLeft, viewTop)

  const allParts = polylinePoints.split(' ')
  const [sx, sy] = (allParts[0] ?? '0,0').split(',').map(Number)
  const [ex, ey] = (allParts.at(-1) ?? '0,0').split(',').map(Number)

  return new ImageResponse(
    (
      <div
        style={{
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          background: '#e8e4d8',
        }}
      >
        {tiles.map((tile) => (
          <img
            key={`${tile.x}-${tile.y}`}
            src={`${TILE_URL}/${zoom}/${tile.x}/${tile.y}.png`}
            width={TILE_SIZE}
            height={TILE_SIZE}
            style={{
              position: 'absolute',
              left: tile.screenX,
              top: tile.screenY,
            }}
          />
        ))}
        <svg
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="white"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#FC4C02"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={sx} cy={sy} r="6" fill="#FC4C02" stroke="white" strokeWidth="2.5" />
          <circle cx={ex} cy={ey} r="6" fill="#3B82F6" stroke="white" strokeWidth="2.5" />
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
