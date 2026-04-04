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
                gap: 3,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                padding: '4px 6px',
                lineHeight: 1,
              }}
            >
              <Icon
                width={16}
                height={16}
                style={{ flexShrink: 0, color: '#475569' }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1e293b',
                  whiteSpace: 'nowrap',
                }}
              >
                {point.temperature}°C
              </span>
            </div>
          </CustomOverlayMap>
        )
      })}
    </>
  )
}
