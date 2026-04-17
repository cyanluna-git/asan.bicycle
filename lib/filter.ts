// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DistancePreset = 'short' | 'medium' | 'long' | 'ultralong'

export interface CourseFilterState {
  startPoint: string | null
  distance: DistancePreset | null
  regionId: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DISTANCE_PRESETS: Record<
  DistancePreset,
  { label: string; max: number | null }
> = {
  short: { label: '단거리', max: 50 },
  medium: { label: '중거리', max: 80 },
  long: { label: '장거리', max: 120 },
  ultralong: { label: '초장거리', max: null },
}

const VALID_DISTANCES = new Set<string>(['short', 'medium', 'long', 'ultralong'])
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// URL parse / serialize
// ---------------------------------------------------------------------------

/**
 * Parse URL search params into a validated CourseFilterState.
 * Invalid or unknown values are silently ignored (returns default state).
 */
export function parseFilterParams(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
): CourseFilterState {
  const get = (key: string): string | null => {
    if (searchParams instanceof URLSearchParams) {
      return searchParams.get(key)
    }
    const v = searchParams[key]
    if (Array.isArray(v)) return v[0] ?? null
    return v ?? null
  }

  // startPoint — validate UUID format before accepting
  const rawStartPoint = get('startPoint')
  const startPoint =
    typeof rawStartPoint === 'string' && UUID_REGEX.test(rawStartPoint)
      ? rawStartPoint
      : null

  // distance — single value
  const rawDistance = get('distance')
  const distance =
    rawDistance && VALID_DISTANCES.has(rawDistance)
      ? (rawDistance as DistancePreset)
      : null

  // regionId — validate UUID format
  const rawRegionId = get('region')
  const regionId =
    typeof rawRegionId === 'string' && UUID_REGEX.test(rawRegionId)
      ? rawRegionId
      : null

  return { startPoint, distance, regionId }
}

/**
 * Serialize a CourseFilterState into a query string (without leading `?`).
 * Omits empty/null values.
 */
export function buildFilterQuery(state: CourseFilterState): string {
  const params = new URLSearchParams()

  if (state.startPoint) params.set('startPoint', state.startPoint)
  if (state.distance) params.set('distance', state.distance)
  if (state.regionId) params.set('region', state.regionId)

  return params.toString()
}

/**
 * Count the number of active filter categories for badge display.
 */
export function countActiveFilters(state: CourseFilterState): number {
  let count = 0
  if (state.startPoint) count++
  if (state.distance) count++
  if (state.regionId) count++
  return count
}

/**
 * Returns the default (empty) filter state.
 */
export function defaultFilterState(): CourseFilterState {
  return { startPoint: null, distance: null, regionId: null }
}
