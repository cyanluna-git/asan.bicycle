import type {
  HourlyForecast,
  HourlyForecastWithMeta,
  RidingSuitability,
  WindDirection16,
} from '@/types/weather'

// ---------------------------------------------------------------------------
// Wind direction (16-point Korean compass)
// ---------------------------------------------------------------------------

const WIND_DIRECTIONS: WindDirection16[] = [
  '북', '북북동', '북동', '동북동',
  '동', '동남동', '남동', '남남동',
  '남', '남남서', '남서', '서남서',
  '서', '서북서', '북서', '북북서',
]

export function degreeToWindDirection16(deg: number): WindDirection16 {
  const normalized = ((deg % 360) + 360) % 360
  const index = Math.round(normalized / 22.5) % 16
  return WIND_DIRECTIONS[index]
}

// ---------------------------------------------------------------------------
// Nighttime check
// ---------------------------------------------------------------------------

export function isNighttime(datetime: string): boolean {
  const hour = new Date(datetime).getHours()
  return hour < 6 || hour >= 21
}

// ---------------------------------------------------------------------------
// Riding suitability evaluation
// ---------------------------------------------------------------------------

export function evaluateRidingSuitability(
  forecast: HourlyForecast,
): RidingSuitability {
  const { temperature, windSpeed, precipitationProbability, precipitationType } = forecast

  // Sub-zero always not recommended
  if (temperature < 0) return 'not_recommended'

  // Active precipitation
  if (precipitationType !== 0) return 'not_recommended'

  // Very high wind (>= 10 m/s)
  if (windSpeed >= 10) return 'not_recommended'

  // High precipitation probability
  if (precipitationProbability >= 60) return 'not_recommended'

  // Moderate conditions
  if (
    windSpeed >= 6 ||
    precipitationProbability >= 30 ||
    temperature >= 35 ||
    temperature < 5
  ) {
    return 'moderate'
  }

  return 'good'
}

// ---------------------------------------------------------------------------
// Enrich forecast with computed metadata
// ---------------------------------------------------------------------------

export function enrichForecast(f: HourlyForecast): HourlyForecastWithMeta {
  return {
    ...f,
    suitability: evaluateRidingSuitability(f),
    windDirectionLabel: degreeToWindDirection16(f.windDirection),
    isNighttime: isNighttime(f.datetime),
  }
}

// ---------------------------------------------------------------------------
// Weather icon name (lucide icon names)
// ---------------------------------------------------------------------------

export function getWeatherIconName(
  sky: number,
  pty: number,
  isNight: boolean,
): string {
  // Precipitation types take priority
  if (pty === 1 || pty === 5) return 'cloud-rain'
  if (pty === 3 || pty === 7) return 'snowflake'
  if (pty === 2 || pty === 6) return 'cloud-rain-wind'

  // Sky condition
  if (sky === 1) return isNight ? 'moon' : 'sun'
  if (sky === 3) return isNight ? 'cloud-moon' : 'cloud-sun'
  return 'cloud' // sky === 4 or default
}

// ---------------------------------------------------------------------------
// Suitability display metadata
// ---------------------------------------------------------------------------

type SuitabilityMeta = {
  label: string
  className: string
}

const SUITABILITY_META: Record<RidingSuitability, SuitabilityMeta> = {
  good: {
    label: '좋음',
    className: 'bg-emerald-100 text-emerald-700 ring-emerald-300/50',
  },
  moderate: {
    label: '보통',
    className: 'bg-amber-100 text-amber-700 ring-amber-300/50',
  },
  not_recommended: {
    label: '비추천',
    className: 'bg-red-100 text-red-700 ring-red-300/50',
  },
}

export function getSuitabilityMeta(s: RidingSuitability): SuitabilityMeta {
  return SUITABILITY_META[s]
}

// ---------------------------------------------------------------------------
// Date range for forecast picker (today ~ +2)
// ---------------------------------------------------------------------------

export function getDateRangeForForecast(): { min: string; max: string } {
  const now = new Date()
  // Korea timezone offset
  const koreaMs = now.getTime() + 9 * 60 * 60 * 1000
  const koreaDate = new Date(koreaMs)

  const formatDate = (d: Date): string => {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const min = formatDate(koreaDate)

  const maxDate = new Date(koreaDate)
  maxDate.setUTCDate(maxDate.getUTCDate() + 2)
  const max = formatDate(maxDate)

  return { min, max }
}
