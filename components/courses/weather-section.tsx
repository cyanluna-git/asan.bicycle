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
import {
  buildWindSegments,
  buildTimeAwareWindSegments,
  summarizeWind,
  WIND_COLORS,
  WIND_LABELS,
  type WindSegment,
} from '@/lib/wind-analysis'
import type { RouteGeoJSON } from '@/types/course'
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

// ---------------------------------------------------------------------------
// Default speed helpers
// ---------------------------------------------------------------------------

export function getDefaultSpeed(theme: string | null | undefined): number {
  if (!theme) return 25
  const lower = theme.toLowerCase()
  if (lower.includes('로드') || lower.includes('road')) return 28
  if (lower.includes('mtb') || lower.includes('산악')) return 18
  return 25
}

// ---------------------------------------------------------------------------
// WeatherSection component
// ---------------------------------------------------------------------------

interface WeatherSectionProps {
  lat: number
  lng: number
  routeGeoJSON?: RouteGeoJSON | null
  courseTheme?: string | null
  initialDepartureTime?: string
  initialAvgSpeed?: number
  onWindDataChange?: (windDirection: number | null, windSpeed: number | null) => void
  onWindSegmentsChange?: (segments: WindSegment[] | null) => void
}

export function WeatherSection({
  lat,
  lng,
  routeGeoJSON,
  courseTheme,
  initialDepartureTime,
  initialAvgSpeed,
  onWindDataChange,
  onWindSegmentsChange,
}: WeatherSectionProps) {
  const dateRange = useMemo(() => getDateRangeForForecast(), [])
  const [selectedDate, setSelectedDate] = useState(dateRange.min)
  const [data, setData] = useState<WeatherForecastResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [departureTime, setDepartureTime] = useState(initialDepartureTime ?? '07:00')
  const [avgSpeed, setAvgSpeed] = useState(initialAvgSpeed ?? getDefaultSpeed(courseTheme))
  const [timeAwareMode, setTimeAwareMode] = useState(false)

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

  // Compute average wind for the selected date's daytime hours (6-21)
  const averageWind = useMemo(() => {
    const daytime = enrichedForecasts.filter((f) => !f.isNighttime)
    if (daytime.length === 0) return null

    const avgDir = daytime.reduce((sum, f) => sum + f.windDirection, 0) / daytime.length
    const avgSpd = daytime.reduce((sum, f) => sum + f.windSpeed, 0) / daytime.length
    return { direction: Math.round(avgDir), speed: Math.round(avgSpd * 10) / 10 }
  }, [enrichedForecasts])

  // Notify parent of wind data for elevation panel integration
  useEffect(() => {
    if (!onWindDataChange) return
    if (averageWind) {
      onWindDataChange(averageWind.direction, averageWind.speed)
    } else {
      onWindDataChange(null, null)
    }
  }, [averageWind, onWindDataChange])

  // Reset time-aware mode when date changes
  const handleDateChange = useCallback((date: string) => {
    setSelectedDate(date)
    setTimeAwareMode(false)
  }, [])

  // Time-aware wind segments (only when button is clicked)
  const timeAwareSegments = useMemo<WindSegment[]>(() => {
    if (!timeAwareMode || !routeGeoJSON || enrichedForecasts.length === 0) return []
    const departureIso = `${selectedDate}T${departureTime}`
    return buildTimeAwareWindSegments(routeGeoJSON, enrichedForecasts, departureIso, avgSpeed)
  }, [timeAwareMode, routeGeoJSON, enrichedForecasts, selectedDate, departureTime, avgSpeed])

  // Average-mode segments
  const averageSegments = useMemo<WindSegment[]>(() => {
    if (!routeGeoJSON || !averageWind || averageWind.speed <= 0) return []
    return buildWindSegments(routeGeoJSON, averageWind.direction, averageWind.speed)
  }, [routeGeoJSON, averageWind])

  const activeSegments = timeAwareMode && timeAwareSegments.length > 0
    ? timeAwareSegments
    : averageSegments

  // Wind summary for this route + current wind
  const windSummary = useMemo(() => {
    if (activeSegments.length === 0) return null
    return summarizeWind(activeSegments)
  }, [activeSegments])

  // Notify parent of wind segments for elevation panel sync
  useEffect(() => {
    if (!onWindSegmentsChange) return
    if (timeAwareMode && timeAwareSegments.length > 0) {
      onWindSegmentsChange(timeAwareSegments)
    } else {
      onWindSegmentsChange(null)
    }
  }, [timeAwareMode, timeAwareSegments, onWindSegmentsChange])

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
            onChange={(e) => handleDateChange(e.target.value)}
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

      {windSummary && (
        <WindSummaryBar
          summary={windSummary}
          isTimeAware={timeAwareMode && timeAwareSegments.length > 0}
        />
      )}

      {routeGeoJSON && averageWind && averageWind.speed > 0 && (
        <div className="mt-3 rounded-xl border bg-background px-3 py-2.5">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            시간대별 바람 분석
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">출발시간</span>
              <input
                type="time"
                value={departureTime}
                onChange={(e) => {
                  setDepartureTime(e.target.value)
                  setTimeAwareMode(false)
                }}
                className="h-7 rounded-lg border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground">평균속도 (km/h)</span>
              <input
                type="number"
                min={10}
                max={50}
                step={1}
                value={avgSpeed}
                onChange={(e) => {
                  setAvgSpeed(Number(e.target.value))
                  setTimeAwareMode(false)
                }}
                className="h-7 w-16 rounded-lg border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </label>
            <button
              type="button"
              onClick={() => setTimeAwareMode(true)}
              className="h-7 shrink-0 rounded-lg bg-foreground px-3 text-[11px] font-medium text-background transition-colors hover:bg-foreground/85"
            >
              바람 분석 업데이트
            </button>
          </div>
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

function WindSummaryBar({ summary, isTimeAware = false }: {
  summary: { headwindPercent: number; tailwindPercent: number; crosswindPercent: number }
  isTimeAware?: boolean
}) {
  const entries = [
    { key: 'headwind' as const, pct: summary.headwindPercent },
    { key: 'tailwind' as const, pct: summary.tailwindPercent },
    { key: 'crosswind' as const, pct: summary.crosswindPercent },
  ]

  return (
    <div className="mt-3 rounded-xl border bg-background px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {isTimeAware ? '시간대별 분석' : '코스 바람 분석'}
        </span>
        <div className="flex items-center gap-2">
          {entries.map(({ key, pct }) => (
            <span key={key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: WIND_COLORS[key] }}
                aria-hidden
              />
              {WIND_LABELS[key]} {pct}%
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full">
        {entries
          .filter(({ pct }) => pct > 0)
          .map(({ key, pct }) => (
            <div
              key={key}
              style={{ width: `${pct}%`, backgroundColor: WIND_COLORS[key] }}
              aria-label={`${WIND_LABELS[key]} ${pct}%`}
            />
          ))}
      </div>
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
