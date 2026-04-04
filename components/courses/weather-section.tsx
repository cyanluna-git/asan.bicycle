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
  buildWeatherMapPoints,
  buildWindSegments,
  buildTimeAwareWindSegments,
  buildWindMapOverlays,
  summarizeWind,
  WIND_COLORS,
  WIND_LABELS,
  type WeatherMapPoint,
  type WindMapOverlay,
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
  distanceKm?: number
  routeGeoJSON?: RouteGeoJSON | null
  courseTheme?: string | null
  initialDate?: string
  initialDepartureTime?: string
  initialAvgSpeed?: number
  onWindDataChange?: (windDirection: number | null, windSpeed: number | null) => void
  onWindSegmentsChange?: (segments: WindSegment[] | null) => void
  onWindMapOverlaysChange?: (overlays: WindMapOverlay[]) => void
  onWeatherMapPointsChange?: (points: WeatherMapPoint[]) => void
}

export function WeatherSection({
  lat,
  lng,
  distanceKm,
  routeGeoJSON,
  courseTheme,
  initialDate,
  initialDepartureTime,
  initialAvgSpeed,
  onWindDataChange,
  onWindSegmentsChange,
  onWindMapOverlaysChange,
  onWeatherMapPointsChange,
}: WeatherSectionProps) {
  const dateRange = useMemo(() => getDateRangeForForecast(), [])
  const [selectedDate, setSelectedDate] = useState(initialDate ?? dateRange.min)
  const [data, setData] = useState<WeatherForecastResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [departureTime, setDepartureTime] = useState(initialDepartureTime ?? '07:00')
  const [avgSpeed, setAvgSpeed] = useState(initialAvgSpeed ?? getDefaultSpeed(courseTheme))
  const [timeAwareMode, setTimeAwareMode] = useState(true)

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

  // 출발시간 ~ 출발+주행시간+1시간 범위만 필터링
  const enrichedForecasts: HourlyForecastWithMeta[] = useMemo(() => {
    if (!data) return []

    const depHour = parseInt(departureTime.split(':')[0], 10) || 7
    const ridingHours = distanceKm && avgSpeed > 0 ? distanceKm / avgSpeed : 4
    const endHour = depHour + Math.ceil(ridingHours) + 1

    return data.forecasts
      .filter((f) => f.datetime.startsWith(selectedDate))
      .map(enrichForecast)
      .filter((f) => {
        const h = new Date(f.datetime).getHours()
        return h >= depHour && h <= endHour
      })
  }, [data, selectedDate, departureTime, distanceKm, avgSpeed])

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

  // Build wind map overlays for route overlay visualization
  const windMapOverlays = useMemo<WindMapOverlay[]>(() => {
    if (!routeGeoJSON || enrichedForecasts.length === 0 || avgSpeed <= 0) return []
    const departureIso = `${selectedDate}T${departureTime}`
    return buildWindMapOverlays(routeGeoJSON, enrichedForecasts, departureIso, avgSpeed)
  }, [routeGeoJSON, enrichedForecasts, selectedDate, departureTime, avgSpeed])

  // Notify parent of wind map overlays
  useEffect(() => {
    if (!onWindMapOverlaysChange) return
    onWindMapOverlaysChange(windMapOverlays)
  }, [windMapOverlays, onWindMapOverlaysChange])

  // Build weather map points at key route positions
  const weatherMapPoints = useMemo<WeatherMapPoint[]>(() => {
    if (!routeGeoJSON || enrichedForecasts.length === 0 || avgSpeed <= 0) return []
    const departureIso = `${selectedDate}T${departureTime}`
    return buildWeatherMapPoints(routeGeoJSON, enrichedForecasts, departureIso, avgSpeed)
  }, [routeGeoJSON, enrichedForecasts, selectedDate, departureTime, avgSpeed])

  // Notify parent of weather map points
  useEffect(() => {
    if (!onWeatherMapPointsChange) return
    onWeatherMapPointsChange(weatherMapPoints)
  }, [weatherMapPoints, onWeatherMapPointsChange])

  return (
    <div className="rounded-[24px] border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          날씨 예보
        </h3>
        <div className="flex items-center gap-1.5">
          {data?.mock && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-300/50">
              Mock
            </span>
          )}
          {(['오늘', '내일', '모레'] as const).map((label, i) => {
            const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
            d.setDate(d.getDate() + i)
            const val = d.toISOString().slice(0, 10)
            return (
              <button
                key={val}
                type="button"
                onClick={() => handleDateChange(val)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                  selectedDate === val
                    ? 'border-foreground bg-foreground text-background'
                    : 'bg-background text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            )
          })}
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
        <div className="space-y-1.5">
          {enrichedForecasts.map((f) => (
            <HourlyRow key={f.datetime} forecast={f} />
          ))}
        </div>
      )}

      {windSummary && (
        <WindSummaryBar
          summary={windSummary}
          isTimeAware={timeAwareMode && timeAwareSegments.length > 0}
        />
      )}

    </div>
  )
}

// ---------------------------------------------------------------------------
// Hourly row (vertical stack)
// ---------------------------------------------------------------------------

function HourlyRow({ forecast }: { forecast: HourlyForecastWithMeta }) {
  const hour = new Date(forecast.datetime).getHours()
  const hourLabel = `${String(hour).padStart(2, '0')}시`
  const suitability = getSuitabilityMeta(forecast.suitability)
  const isSubZero = forecast.temperature < 0

  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2">
      <span className="w-9 text-xs font-medium text-muted-foreground">{hourLabel}</span>
      <WeatherIcon
        sky={forecast.skyCondition}
        pty={forecast.precipitationType}
        isNight={forecast.isNighttime}
        className="h-5 w-5 shrink-0 text-foreground/70"
      />
      <span
        className={`w-9 text-sm font-semibold ${isSubZero ? 'text-red-600' : 'text-foreground'}`}
      >
        {forecast.temperature}°
      </span>
      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <ArrowUp
          className="h-3 w-3"
          style={{ transform: `rotate(${(forecast.windDirection + 180) % 360}deg)` }}
        />
        <span>{forecast.windSpeed}</span>
      </div>
      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Droplets className="h-3 w-3" />
        <span>{forecast.precipitationProbability}%</span>
      </div>
      <span
        className={`ml-auto inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${suitability.className}`}
      >
        {suitability.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hourly card (kept for potential reuse)
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
