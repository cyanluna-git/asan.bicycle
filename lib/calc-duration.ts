export const SPEED_BEGINNER = 20
export const SPEED_INTERMEDIATE = 26.5
export const SPEED_ADVANCED = 30

export function calcDuration(
  distance_km: number,
  elevation_gain_m: number,
  speed_kmh: number,
): string {
  const elevation_penalty = Math.floor(elevation_gain_m / 500) * 0.1
  const effective_speed = Math.max(1, speed_kmh * (1 - elevation_penalty))
  const hours = distance_km / effective_speed
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}
