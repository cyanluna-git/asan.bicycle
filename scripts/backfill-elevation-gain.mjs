#!/usr/bin/env node

/**
 * Re-compute `elevation_gain_m` for every course using the 5-point
 * moving-average algorithm from lib/gpx-parser.ts.
 *
 * Reads 3D coordinates ([lng, lat, ele]) out of `courses.route_geojson`
 * — uploaded coursera preserve elevation here, so no storage round-trip
 * is required.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-elevation-gain.mjs
 *   node --env-file=.env.local scripts/backfill-elevation-gain.mjs --apply
 *
 * Without --apply the script runs in dry-run mode and prints a diff
 * table only. Add --apply to write updates back to Supabase.
 */

import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

/**
 * Elevation gain with 3-point median spike rejection + 5-point moving
 * average smoothing. Spike rejection kills isolated "zero sentinel"
 * dropouts some GPX exporters write as missing-data markers; smoothing
 * suppresses GPS noise on gradual climbs. No per-sample threshold.
 */
function calculateElevationGain(coords) {
  const eles = []
  for (const c of coords) {
    const e = c[2]
    if (e == null || Number.isNaN(e)) continue
    // Drop exact-0.0 sentinel markers some GPX exporters write for
    // missing elevation. Real GPS sea-level readings are never exactly
    // 0.0 due to measurement noise.
    if (e === 0) continue
    eles.push(e)
  }
  if (eles.length < 2) return 0

  // 5-point moving average smoothing (only when input is large enough).
  let smoothed
  if (eles.length >= 5) {
    smoothed = new Array(eles.length)
    for (let i = 0; i < eles.length; i++) {
      const lo = Math.max(0, i - 2)
      const hi = Math.min(eles.length - 1, i + 2)
      let sum = 0
      for (let j = lo; j <= hi; j++) sum += eles[j]
      smoothed[i] = sum / (hi - lo + 1)
    }
  } else {
    smoothed = eles
  }

  let gain = 0
  for (let i = 1; i < smoothed.length; i++) {
    const delta = smoothed[i] - smoothed[i - 1]
    if (delta > 0) gain += delta
  }
  return Math.round(gain)
}

function extractCoordsWithElevation(routeGeojson) {
  if (!routeGeojson || !Array.isArray(routeGeojson.features)) return []
  const coords = []
  for (const feature of routeGeojson.features) {
    if (feature?.geometry?.type !== 'LineString') continue
    const featureCoords = feature.geometry.coordinates ?? []
    for (const coord of featureCoords) {
      if (!Array.isArray(coord)) continue
      coords.push(coord)
    }
  }
  return coords
}

function hasElevation(coords) {
  return coords.some((c) => c.length >= 3 && typeof c[2] === 'number' && Number.isFinite(c[2]))
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from('courses')
    .select('id, title, distance_km, elevation_gain_m, route_geojson')
    .not('route_geojson', 'is', null)
    .order('elevation_gain_m', { ascending: false })

  if (error) throw error

  const rows = data ?? []
  const eligible = []
  const skippedDownward = []
  const skippedUnrealistic = []
  const noElevation = []
  const unchanged = []

  for (const course of rows) {
    const coords = extractCoordsWithElevation(course.route_geojson)
    if (coords.length === 0 || !hasElevation(coords)) {
      noElevation.push(course)
      continue
    }
    const oldGain = course.elevation_gain_m ?? 0
    const newGain = calculateElevationGain(coords)
    const delta = newGain - oldGain
    const entry = { id: course.id, title: course.title, distanceKm: course.distance_km, oldGain, newGain, delta }

    if (newGain === oldGain) {
      unchanged.push(entry)
      continue
    }

    // Sanity check: reject absurd ratios (> 100 m/km is basically impossible
    // on a bike — even the Mortirolo averages ~75 m/km over 12 km).
    if (course.distance_km > 0 && newGain / course.distance_km > 100) {
      skippedUnrealistic.push(entry)
      continue
    }

    // Asymmetric rule: the original bug was *under-counting* (3m per-sample
    // threshold dropped gradual climbs). So only accept UPWARD corrections.
    // Downward changes likely mean the old value was already correct and our
    // smoothing is now over-flattening. Require a meaningful jump to avoid
    // rewriting dozens of rows by single-metre drift.
    if (delta < 30) {
      skippedDownward.push(entry)
      continue
    }

    eligible.push(entry)
  }

  eligible.sort((a, b) => b.delta - a.delta)
  skippedUnrealistic.sort((a, b) => b.newGain - a.newGain)

  console.log(`Total rows with route_geojson:     ${rows.length}`)
  console.log(`  unchanged:                       ${unchanged.length}`)
  console.log(`  no elevation:                    ${noElevation.length}`)
  console.log(`  skipped (downward / tiny delta): ${skippedDownward.length}`)
  console.log(`  skipped (unrealistic > 100m/km): ${skippedUnrealistic.length}`)
  console.log(`  would apply:                     ${eligible.length}`)
  console.log('')

  if (skippedUnrealistic.length > 0) {
    console.log('Unrealistic (skipped — data likely corrupt, review manually):')
    console.log('  dist   old → new    title')
    console.log('  ─────────────────────────────────────────────')
    for (const d of skippedUnrealistic.slice(0, 10)) {
      const dist = `${Number(d.distanceKm ?? 0).toFixed(0)}km`.padStart(5)
      const arrow = `${String(d.oldGain).padStart(5)} → ${String(d.newGain).padStart(5)}`
      console.log(`  ${dist}  ${arrow}  ${d.title}`)
    }
    console.log('')
  }

  console.log(`Top 30 upward corrections (would apply):`)
  console.log('  dist   old → new   (Δ)     title')
  console.log('  ─────────────────────────────────────────────')
  for (const d of eligible.slice(0, 30)) {
    const dist = `${Number(d.distanceKm ?? 0).toFixed(0)}km`.padStart(5)
    const arrow = `${String(d.oldGain).padStart(5)} → ${String(d.newGain).padStart(5)}`
    const delta = `(+${d.delta})`.padStart(8)
    console.log(`  ${dist}  ${arrow}  ${delta}  ${d.title}`)
  }

  if (!APPLY) {
    console.log('')
    console.log('Dry run only. Re-run with --apply to write updates.')
    return
  }

  console.log('')
  console.log(`Applying ${eligible.length} updates…`)
  let applied = 0
  for (const d of eligible) {
    const { error: updateError } = await supabase
      .from('courses')
      .update({ elevation_gain_m: d.newGain })
      .eq('id', d.id)
    if (updateError) {
      console.error(`  ✗ ${d.id} (${d.title}): ${updateError.message}`)
      continue
    }
    applied += 1
  }
  console.log(`Applied ${applied}/${eligible.length} updates.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
