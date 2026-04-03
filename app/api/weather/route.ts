import { NextResponse } from 'next/server'
import {
  convertLatLngToGrid,
  fetchWeatherForecast,
  generateMockForecast,
  isGridInRange,
} from '@/lib/weather'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_FORECAST_DAYS = 3

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')
  const dateStr = searchParams.get('date')

  if (!latStr || !lngStr) {
    return jsonError('lat, lng 파라미터가 필요합니다.', 400)
  }

  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return jsonError('유효한 lat, lng 값이 필요합니다.', 400)
  }

  if (!dateStr || !DATE_PATTERN.test(dateStr)) {
    return jsonError('date 파라미터가 필요합니다. (형식: YYYY-MM-DD)', 400)
  }

  const targetDate = new Date(`${dateStr}T00:00:00+09:00`)
  if (isNaN(targetDate.getTime())) {
    return jsonError('유효하지 않은 날짜입니다.', 400)
  }

  // 3일 제한 검사
  const now = new Date()
  const koreaOffset = 9 * 60 * 60 * 1000
  const koreaToday = new Date(now.getTime() + koreaOffset)
  koreaToday.setUTCHours(0, 0, 0, 0)

  const diffMs = targetDate.getTime() - koreaToday.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < -1 || diffDays > MAX_FORECAST_DAYS) {
    return jsonError(
      `예보 조회는 오늘 기준 ${MAX_FORECAST_DAYS}일 이내만 가능합니다.`,
      400,
    )
  }

  // 격자 변환 및 범위 검사
  const { nx, ny } = convertLatLngToGrid(lat, lng)

  if (!isGridInRange(nx, ny)) {
    return jsonError(
      '좌표가 기상청 격자 범위를 벗어났습니다.',
      400,
    )
  }

  // WEATHER_API_KEY 미설정 시 mock fallback
  const apiKey = process.env.WEATHER_API_KEY
  if (!apiKey) {
    const mockData = generateMockForecast(lat, lng, targetDate)
    return NextResponse.json(mockData)
  }

  try {
    const forecast = await fetchWeatherForecast(lat, lng, targetDate)
    return NextResponse.json(forecast)
  } catch (error) {
    console.error(
      '[api/weather] 기상청 API 호출 실패:',
      error instanceof Error ? error.message : error,
    )
    return jsonError('기상청 API 호출에 실패했습니다.', 502)
  }
}
