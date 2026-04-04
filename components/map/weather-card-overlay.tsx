'use client'

import {
  Cloud,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
} from 'lucide-react'
import { CustomOverlayMap } from 'react-kakao-maps-sdk'
import { getWeatherIconName } from '@/lib/weather-ui'
import type { WeatherMapPoint } from '@/lib/wind-analysis'

const ICON_MAP: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  sun: Sun,
  moon: Moon,
  'cloud-sun': CloudSun,
  'cloud-moon': CloudMoon,
  cloud: Cloud,
  'cloud-rain': CloudRain,
  'cloud-rain-wind': CloudRainWind,
  snowflake: Snowflake,
}

interface WeatherCardOverlayProps {
  points: WeatherMapPoint[]
}

export function WeatherCardOverlay({ points }: WeatherCardOverlayProps) {
  if (points.length === 0) return null

  return (
    <>
      {points.map((point, index) => {
        const iconName = getWeatherIconName(point.skyCondition, point.precipitationType, false)
        const Icon = ICON_MAP[iconName] ?? Cloud

        return (
          <CustomOverlayMap
            key={`weather-card-${index}`}
            position={{ lat: point.lat, lng: point.lng }}
            xAnchor={0.5}
            yAnchor={1.3}
            zIndex={5}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                borderRadius: 10,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                padding: '5px 10px',
                lineHeight: 1,
                border: '1px solid rgba(0,0,0,0.08)',
              }}
            >
              <Icon
                width={20}
                height={20}
                style={{ flexShrink: 0, color: '#475569' }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#1e293b',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.temperature}°
              </span>
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}
