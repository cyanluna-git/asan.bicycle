import type {
  HourlyForecast,
  PrecipitationType,
  SkyCondition,
  WeatherCategory,
  WeatherForecastResponse,
} from '@/types/weather'

// ---------------------------------------------------------------------------
// LCC projection constants (기상청 격자 변환)
// ---------------------------------------------------------------------------

const RE = 6371.00877
const GRID = 5.0
const SLAT1 = 30.0
const SLAT2 = 60.0
const OLON = 126.0
const OLAT = 38.0
const XO = 43
const YO = 136

const DEG_TO_RAD = Math.PI / 180.0

/**
 * 위경도를 기상청 격자 좌표(nx, ny)로 변환한다.
 * Lambert Conformal Conic (LCC) projection.
 */
export function convertLatLngToGrid(
  lat: number,
  lng: number,
): { nx: number; ny: number } {
  const re = RE / GRID
  const slat1 = SLAT1 * DEG_TO_RAD
  const slat2 = SLAT2 * DEG_TO_RAD
  const olon = OLON * DEG_TO_RAD
  const olat = OLAT * DEG_TO_RAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5)
    / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)

  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn

  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  let ra = Math.tan(Math.PI * 0.25 + lat * DEG_TO_RAD * 0.5)
  ra = (re * sf) / Math.pow(ra, sn)

  let theta = lng * DEG_TO_RAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)

  return { nx, ny }
}

/**
 * 격자 좌표가 유효 범위 내인지 검사한다.
 * nx: 1~149, ny: 1~253
 */
export function isGridInRange(nx: number, ny: number): boolean {
  return nx >= 1 && nx <= 149 && ny >= 1 && ny <= 253
}

// ---------------------------------------------------------------------------
// Base date/time resolution (발표시각 계산)
// ---------------------------------------------------------------------------

const BASE_TIMES = [
  '2300', '2000', '1700', '1400', '1100', '0800', '0500', '0200',
] as const

/**
 * 주어진 시각 기준으로 가장 최근 발표시각을 계산한다.
 * 발표시각: 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
 * API 제공 시각은 발표시각 + 약 10분이므로 10분 버퍼를 둔다.
 */
export function resolveBaseDateTime(targetDate: Date): {
  baseDate: string
  baseTime: string
} {
  // targetDate는 Date.now() + 9h 로 만들어진 객체이므로 UTC 메서드로 읽어야 함
  // (로컬 타임존이 KST면 getHours()가 9시간 이중 적용돼 잘못된 base_time 계산)
  const year = targetDate.getUTCFullYear()
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getUTCDate()).padStart(2, '0')

  // 현재 시각에서 10분 버퍼를 뺀 시각으로 비교
  const bufferedMinutes = targetDate.getUTCHours() * 60 + targetDate.getUTCMinutes() - 10

  for (const bt of BASE_TIMES) {
    const btMinutes = parseInt(bt.slice(0, 2), 10) * 60 + parseInt(bt.slice(2), 10)
    if (bufferedMinutes >= btMinutes) {
      return {
        baseDate: `${year}${month}${day}`,
        baseTime: bt,
      }
    }
  }

  // 02:10 이전 → 전일 23:00
  const prevDay = new Date(targetDate)
  prevDay.setUTCDate(prevDay.getUTCDate() - 1)
  const pYear = prevDay.getUTCFullYear()
  const pMonth = String(prevDay.getUTCMonth() + 1).padStart(2, '0')
  const pDay = String(prevDay.getUTCDate()).padStart(2, '0')

  return {
    baseDate: `${pYear}${pMonth}${pDay}`,
    baseTime: '2300',
  }
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

const KMA_ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'

const CATEGORY_SET = new Set<WeatherCategory>([
  'TMP', 'WSD', 'VEC', 'POP', 'SKY', 'PTY',
])

type KmaItem = {
  category: string
  fcstDate: string
  fcstTime: string
  fcstValue: string
}

/**
 * 기상청 단기예보 API를 호출하여 파싱된 예보 데이터를 반환한다.
 * 5초 타임아웃 적용.
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  _date: Date,
): Promise<WeatherForecastResponse> {
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    throw new Error('WEATHER_API_KEY is not configured')
  }

  const { nx, ny } = convertLatLngToGrid(lat, lng)
  // 항상 현재 시각(KST) 기준으로 최신 발표시각을 사용 — 미래 날짜 예보도 포함됨
  const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const { baseDate, baseTime } = resolveBaseDateTime(nowKST)

  // serviceKey는 URL 인코딩 없이 raw로 전달해야 함 (이중 인코딩 방지)
  const queryString = [
    `serviceKey=${apiKey}`,
    'numOfRows=1000',
    'pageNo=1',
    'dataType=JSON',
    `base_date=${baseDate}`,
    `base_time=${baseTime}`,
    `nx=${nx}`,
    `ny=${ny}`,
  ].join('&')
  const url = `${KMA_ENDPOINT}?${queryString}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    throw new Error(`기상청 API 응답 오류: ${res.status}`)
  }

  const json = await res.json()
  const items: KmaItem[] =
    json?.response?.body?.items?.item ?? []

  if (items.length === 0) {
    const resultCode = json?.response?.header?.resultCode
    const resultMsg = json?.response?.header?.resultMsg
    throw new Error(
      `기상청 API 데이터 없음: ${resultCode ?? 'UNKNOWN'} ${resultMsg ?? ''}`.trim(),
    )
  }

  const forecasts = parseKmaItems(items)

  return {
    grid: { nx, ny },
    baseDate,
    baseTime,
    forecasts,
    mock: false,
  }
}

function parseKmaItems(items: KmaItem[]): HourlyForecast[] {
  // Group by datetime
  const grouped = new Map<string, Partial<Record<WeatherCategory, number>>>()

  for (const item of items) {
    if (!CATEGORY_SET.has(item.category as WeatherCategory)) continue

    const key = `${item.fcstDate}${item.fcstTime}`
    if (!grouped.has(key)) {
      grouped.set(key, {})
    }
    grouped.get(key)![item.category as WeatherCategory] = parseFloat(item.fcstValue)
  }

  const forecasts: HourlyForecast[] = []

  for (const [key, values] of grouped) {
    // key = YYYYMMDD + HHMM (12자리)
    const date = key.slice(0, 8)
    const time = key.slice(8)
    const datetime = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2)}:00`

    forecasts.push({
      datetime,
      temperature: values.TMP ?? 0,
      windSpeed: values.WSD ?? 0,
      windDirection: values.VEC ?? 0,
      precipitationProbability: values.POP ?? 0,
      skyCondition: (values.SKY ?? 1) as SkyCondition,
      precipitationType: (values.PTY ?? 0) as PrecipitationType,
    })
  }

  forecasts.sort((a, b) => a.datetime.localeCompare(b.datetime))

  return forecasts
}

// ---------------------------------------------------------------------------
// Mock data generator
// ---------------------------------------------------------------------------

/**
 * 3일간 시간대별 현실적인 mock 예보 데이터를 생성한다.
 */
export function generateMockForecast(
  lat: number,
  lng: number,
  date: Date,
): WeatherForecastResponse {
  const { nx, ny } = convertLatLngToGrid(lat, lng)
  const { baseDate, baseTime } = resolveBaseDateTime(date)

  const forecasts: HourlyForecast[] = []

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const forecastDay = new Date(date)
    forecastDay.setDate(forecastDay.getDate() + dayOffset)
    const year = forecastDay.getFullYear()
    const month = String(forecastDay.getMonth() + 1).padStart(2, '0')
    const day = String(forecastDay.getDate()).padStart(2, '0')

    for (let hour = 0; hour < 24; hour += 3) {
      const hh = String(hour).padStart(2, '0')
      const datetime = `${year}-${month}-${day}T${hh}:00:00`

      // Simulate a realistic diurnal temperature curve
      const baseTemp = 12
      const amplitude = 8
      const hourAngle = ((hour - 15) / 24) * 2 * Math.PI
      const temperature = Math.round(
        (baseTemp + amplitude * Math.cos(hourAngle) + dayOffset * 0.5) * 10,
      ) / 10

      const windSpeed = Math.round((2 + Math.random() * 4) * 10) / 10
      const windDirection = Math.round(Math.random() * 360)
      const precipitationProbability = hour >= 12 && hour <= 18
        ? Math.round(Math.random() * 30)
        : Math.round(Math.random() * 10)

      const skyCondition: SkyCondition =
        precipitationProbability > 20 ? 4 : precipitationProbability > 10 ? 3 : 1
      const precipitationType: PrecipitationType = 0

      forecasts.push({
        datetime,
        temperature,
        windSpeed,
        windDirection,
        precipitationProbability,
        skyCondition,
        precipitationType,
      })
    }
  }

  return {
    grid: { nx, ny },
    baseDate,
    baseTime,
    forecasts,
    mock: true,
  }
}
