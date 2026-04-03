export type WeatherCategory = 'TMP' | 'WSD' | 'VEC' | 'POP' | 'SKY' | 'PTY'

/** 하늘 상태: 1=맑음, 3=구름많음, 4=흐림 */
export type SkyCondition = 1 | 3 | 4

/** 강수 형태: 0=없음, 1=비, 2=비/눈, 3=눈, 5=빗방울, 6=빗방울눈날림, 7=눈날림 */
export type PrecipitationType = 0 | 1 | 2 | 3 | 5 | 6 | 7

export type HourlyForecast = {
  datetime: string
  temperature: number
  windSpeed: number
  windDirection: number
  precipitationProbability: number
  skyCondition: SkyCondition
  precipitationType: PrecipitationType
}

export type WeatherForecastResponse = {
  grid: { nx: number; ny: number }
  baseDate: string
  baseTime: string
  forecasts: HourlyForecast[]
  mock: boolean
}

export type RidingSuitability = 'good' | 'moderate' | 'not_recommended'

export type WindDirection16 =
  | '북' | '북북동' | '북동' | '동북동'
  | '동' | '동남동' | '남동' | '남남동'
  | '남' | '남남서' | '남서' | '서남서'
  | '서' | '서북서' | '북서' | '북북서'

export type HourlyForecastWithMeta = HourlyForecast & {
  suitability: RidingSuitability
  windDirectionLabel: WindDirection16
  isNighttime: boolean
}
