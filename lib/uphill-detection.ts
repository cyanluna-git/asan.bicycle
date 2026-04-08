/**
 * Uphill segment detection from elevation profile data.
 *
 * Detects segments with average gradient >= 7%, merges adjacent segments
 * separated by < 0.5 km, and filters out segments shorter than 1.0 km.
 *
 * This is a secondary fallback detector — famous uphills from the DB
 * are matched first; only non-overlapping uphills >= 1 km are saved.
 */

import type { ElevationPoint } from '@/types/course'

export interface UphillSegmentDraft {
  start_km: number
  end_km: number
  name: string
}

const GRADIENT_THRESHOLD = 0.07 // 7% — only meaningful climbs
const MIN_SEGMENT_LENGTH_KM = 1.0 // 1 km minimum
const MERGE_GAP_KM = 0.5          // merge uphills separated by < 500 m

/**
 * Detect uphill segments from an elevation profile.
 *
 * A point-to-point segment is considered "uphill" when:
 *   (elevation_delta / horizontal_distance) >= 5%
 *
 * Adjacent uphill point-pairs are merged into contiguous segments.
 * Segments separated by less than 0.1 km of non-uphill are also merged.
 * Finally, segments shorter than 0.2 km are discarded.
 */
export function detectUphillSegments(
  profile: ElevationPoint[],
): UphillSegmentDraft[] {
  if (profile.length < 2) return []

  // Step 1: Find raw uphill ranges
  const rawRanges: { start_km: number; end_km: number }[] = []
  let currentStart: number | null = null
  let currentEnd: number | null = null

  for (let i = 1; i < profile.length; i++) {
    const dKm = profile[i].distanceKm - profile[i - 1].distanceKm
    const dEle = profile[i].elevationM - profile[i - 1].elevationM

    if (dKm <= 0) continue

    const gradient = dEle / (dKm * 1000) // dKm in km -> convert to m
    const isUphill = gradient >= GRADIENT_THRESHOLD

    if (isUphill) {
      if (currentStart === null) {
        currentStart = profile[i - 1].distanceKm
      }
      currentEnd = profile[i].distanceKm
    } else {
      if (currentStart !== null && currentEnd !== null) {
        rawRanges.push({ start_km: currentStart, end_km: currentEnd })
        currentStart = null
        currentEnd = null
      }
    }
  }

  // Flush last range
  if (currentStart !== null && currentEnd !== null) {
    rawRanges.push({ start_km: currentStart, end_km: currentEnd })
  }

  if (rawRanges.length === 0) return []

  // Step 2: Merge ranges separated by < MERGE_GAP_KM
  const merged: { start_km: number; end_km: number }[] = [rawRanges[0]]

  for (let i = 1; i < rawRanges.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = rawRanges[i]

    if (curr.start_km - prev.end_km < MERGE_GAP_KM) {
      prev.end_km = curr.end_km
    } else {
      merged.push({ ...curr })
    }
  }

  // Step 3: Filter by minimum length and build drafts
  return merged
    .filter((r) => r.end_km - r.start_km >= MIN_SEGMENT_LENGTH_KM)
    .map((r, i) => ({
      start_km: Math.round(r.start_km * 100) / 100,
      end_km: Math.round(r.end_km * 100) / 100,
      name: `업힐 ${i + 1}`,
    }))
}
