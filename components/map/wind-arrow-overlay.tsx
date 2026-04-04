'use client'

import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { WIND_COLORS, type WindMapOverlay } from '@/lib/wind-analysis'

interface WindArrowOverlayProps {
  overlays: WindMapOverlay[]
}

export function WindArrowOverlay({ overlays }: WindArrowOverlayProps) {
  if (overlays.length === 0) return null

  return (
    <>
      {overlays.map((overlay, index) => {
        const color = WIND_COLORS[overlay.classification]
        // Arrow points in wind-flow direction (where wind is going)
        const rotation = (overlay.windDirection + 180) % 360

        return (
          <CustomOverlayMap
            key={`wind-${index}`}
            position={{ lat: overlay.lat, lng: overlay.lng }}
            xAnchor={0.5}
            yAnchor={0.5}
            zIndex={5}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: '999px',
                backgroundColor: 'rgba(255, 255, 255, 0.85)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                border: `2px solid ${color}`,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 12 12"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: 'transform 200ms ease',
                }}
              >
                <path
                  d="M6 1L9.5 8.5H2.5L6 1Z"
                  fill={color}
                  stroke={color}
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
                <line
                  x1="6"
                  y1="7"
                  x2="6"
                  y2="11"
                  stroke={color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}
