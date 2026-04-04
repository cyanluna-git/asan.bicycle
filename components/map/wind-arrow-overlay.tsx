'use client'

import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { WIND_COLORS, type WindMapOverlay } from '@/lib/wind-analysis'

interface WindArrowOverlayProps {
  overlays: WindMapOverlay[]
}

const DASH_COUNT = 3
const DASH_DELAYS = [0, 0.6, 1.2] // stagger seconds

export function WindArrowOverlay({ overlays }: WindArrowOverlayProps) {
  if (overlays.length === 0) return null

  return (
    <>
      {overlays.map((overlay, index) => {
        const color = WIND_COLORS[overlay.classification]
        // Arrow points in wind-flow direction (where wind is going)
        const flowDeg = (overlay.windDirection + 180) % 360
        const flowRad = (flowDeg * Math.PI) / 180
        // Dash travel vector (px)
        const travelX = Math.sin(flowRad) * 30
        const travelY = -Math.cos(flowRad) * 30 // CSS Y is inverted
        // Animation duration: fast wind = short duration
        const duration = Math.max(1, 3.5 - overlay.windSpeed * 0.25)
        const animName = `wind-trail-${index}`

        return (
          <CustomOverlayMap
            key={`wind-${index}`}
            position={{ lat: overlay.lat, lng: overlay.lng }}
            xAnchor={0.5}
            yAnchor={0.5}
            zIndex={5}
          >
            <div style={{ position: 'relative', width: 32, height: 32 }}>
              {/* Animated dash trails */}
              {overlay.windSpeed > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                  }}
                >
                  <style>{`
                    @keyframes ${animName} {
                      0% {
                        transform: translate(0, 0);
                        opacity: 0.7;
                      }
                      70% {
                        opacity: 0.3;
                      }
                      100% {
                        transform: translate(${travelX}px, ${travelY}px);
                        opacity: 0;
                      }
                    }
                  `}</style>
                  {DASH_DELAYS.slice(0, DASH_COUNT).map((delay, di) => (
                    <div
                      key={di}
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        width: 10,
                        height: 2.5,
                        marginLeft: -5,
                        marginTop: -1.25,
                        borderRadius: 2,
                        backgroundColor: color,
                        opacity: 0,
                        transform: `rotate(${flowDeg}deg)`,
                        transformOrigin: 'center center',
                        animation: `${animName} ${duration}s ease-out ${delay}s infinite`,
                        willChange: 'transform, opacity',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Arrow badge */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: '999px',
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                  border: `2px solid ${color}`,
                  zIndex: 1,
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 12 12"
                  style={{
                    transform: `rotate(${flowDeg}deg)`,
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
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}
