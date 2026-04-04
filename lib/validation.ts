/**
 * Course location validation utilities.
 *
 * Checks whether a coordinate falls within South Korea's territory.
 */

export const ASAN_CENTER = { lat: 36.7897, lng: 127.002 }
export const ASAN_RADIUS_KM = 20

/** Haversine distance between two points in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Check whether a coordinate is within South Korea's territory (lat 33–38.5, lng 125–130). */
export function isValidCourseLocation(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 38.5 && lng >= 125 && lng <= 130
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
