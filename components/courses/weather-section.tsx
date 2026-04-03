'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Cloud,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Droplets,
  Moon,
  Snowflake,
  Sun,
} from 'lucide-react'
import {
  enrichForecast,
  getDateRangeForForecast,
  getSuitabilityMeta,
  getWeatherIconName,
} from '@/lib/weather-ui'
import type { HourlyForecastWithMeta, WeatherForecastResponse } from '@/types/weather'

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

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

function WeatherIcon({
  sky,
  pty,
  isNight,
  className,
}: {
  sky: number
  pty: number
  isNight: boolean
  className?: string
}) {
  const name = getWeatherIconName(sky, pty, isNight)
  const Icon = ICON_MAP[name] ?? Cloud
  return <Icon className={className} />
}

// ---------------------------------------------------------------------------
// WeatherSection component
// ---------------------------------------------------------------------------

interface WeatherSectionProps {
  lat: number
  lng: number
}

export function WeatherSection({ lat, lng }: WeatherSectionProps) {
  const dateRange = useMemo(() => getDateRangeForForecast(), [])
  const [selectedDate, setSelectedDate] = useState(dateRange.min)
  const [data, setData] = useState<WeatherForecastResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchWeather = useCallback(async (
    fetchLat: number,
    fetchLng: number,
    date: string,
  ) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(
        `/api/weather?lat=${fetchLat}&lng=${fetchLng}&date=${date}`,
      )

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(
          body?.error ?? `날씨 정보를 불러올 수 없습니다. (${res.status})`,
        )
      }

      const json: WeatherForecastResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchWeather(lat, lng, selectedDate)
  }, [lat, lng, selectedDate, fetchWeather])

  const enrichedForecasts: HourlyForecastWithMeta[] = useMemo(() => {
    if (!data) return []

    return data.forecasts
      .filter((f) => f.datetime.startsWith(selectedDate))
      .map(enrichForecast)
  }, [data, selectedDate])

  return (
    <div className="rounded-[24px] border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          날씨 예보
        </h3>
        <div className="flex items-center gap-2">
          {data?.mock && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-300/50">
              Mock
            </span>
          )}
          <input
            type="date"
            value={selectedDate}
            min={dateRange.min}
            max={dateRange.max}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>
      </div>

      {loading && <WeatherSkeleton />}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && enrichedForecasts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          해당 날짜의 예보 데이터가 없습니다.
        </p>
      )}

      {!loading && !error && enrichedForecasts.length > 0 && (
        <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-2 touch-pan-x">
          {enrichedForecasts.map((f) => (
            <HourlyCard key={f.datetime} forecast={f} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hourly card
// ---------------------------------------------------------------------------

function HourlyCard({ forecast }: { forecast: HourlyForecastWithMeta }) {
  const hour = new Date(forecast.datetime).getHours()
  const hourLabel = `${String(hour).padStart(2, '0')}시`
  const suitability = getSuitabilityMeta(forecast.suitability)
  const isSubZero = forecast.temperature < 0

  return (
    <div className="flex w-[5.5rem] shrink-0 snap-start flex-col items-center gap-1.5 rounded-2xl border bg-background px-2 py-3 text-center">
      <span className="text-[11px] font-medium text-muted-foreground">
        {hourLabel}
        {forecast.isNighttime && (
          <span className="ml-0.5 text-[10px] text-foreground/40">야간</span>
        )}
      </span>

      <WeatherIcon
        sky={forecast.skyCondition}
        pty={forecast.precipitationType}
        isNight={forecast.isNighttime}
        className="h-6 w-6 text-foreground/70"
      />

      <span
        className={`text-sm font-semibold ${
          isSubZero ? 'text-red-600' : 'text-foreground'
        }`}
      >
        {forecast.temperature}°
      </span>

      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <ArrowUp
          className="h-3 w-3"
          style={{
            transform: `rotate(${(forecast.windDirection + 180) % 360}deg)`,
          }}
        />
        <span>{forecast.windSpeed}</span>
      </div>

      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Droplets className="h-3 w-3" />
        <span>{forecast.precipitationProbability}%</span>
      </div>

      <span
        className={`mt-0.5 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${suitability.className}`}
      >
        {suitability.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function WeatherSkeleton() {
  return (
    <div className="-mx-1 flex gap-2 overflow-hidden px-1">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="flex w-[5.5rem] shrink-0 flex-col items-center gap-2 rounded-2xl border bg-background px-2 py-3"
        >
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-6 animate-pulse rounded bg-muted" />
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
          <div className="h-4 w-10 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}
