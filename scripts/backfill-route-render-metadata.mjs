#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (value) => value * Math.PI / 180
  const earthRadiusKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function classifySlopeBand(slopePct) {
  if (slopePct < 0) return 'descent'
  if (slopePct <= 1) return 'flat'
  if (slopePct <= 5) return 'gentle'
  if (slopePct <= 8) return 'moderate'
  if (slopePct <= 12) return 'steep'
  return 'extreme'
}

function smooth(values) {
  return values.map((_, index) => {
    const start = Math.max(0, index - 1)
    const end = Math.min(values.length - 1, index + 1)
    const window = values.slice(start, end + 1)
    return Math.round((window.reduce((sum, value) => sum + value, 0) / window.length) * 10) / 10
  })
}

function extractPreviewPoints(routeGeojson) {
  const points = []
  for (const feature of routeGeojson?.features ?? []) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coordinate of feature.geometry.coordinates ?? []) {
      points.push({ lat: coordinate[1], lng: coordinate[0] })
    }
  }
  return points
}

function computeBounds(points) {
  if (points.length === 0) return null
  let minLat = points[0].lat
  let maxLat = points[0].lat
  let minLng = points[0].lng
  let maxLng = points[0].lng

  for (const point of points) {
    minLat = Math.min(minLat, point.lat)
    maxLat = Math.max(maxLat, point.lat)
    minLng = Math.min(minLng, point.lng)
    maxLng = Math.max(maxLng, point.lng)
  }

  return { minLat, maxLat, minLng, maxLng }
}

function buildHoverProfile(routeGeojson) {
  const points = []
  let cumKm = 0
  let previous = null

  for (const feature of routeGeojson?.features ?? []) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const coordinate of feature.geometry.coordinates ?? []) {
      const elevation = coordinate[2]
      if (typeof elevation !== 'number' || !Number.isFinite(elevation)) {
        previous = coordinate
        continue
      }

      if (previous) {
        cumKm += haversineKm(previous[1], previous[0], coordinate[1], coordinate[0])
      }

      points.push({
        distanceKm: Math.round(cumKm * 100) / 100,
        elevationM: Math.round(elevation * 10) / 10,
        lat: coordinate[1],
        lng: coordinate[0],
      })

      previous = coordinate
    }
  }

  return points
}

function buildSlopeSegments(hoverProfile) {
  const rawSegments = []

  for (let index = 1; index < hoverProfile.length; index += 1) {
    const previous = hoverProfile[index - 1]
    const current = hoverProfile[index]
    const distanceKm = current.distanceKm - previous.distanceKm
    if (distanceKm <= 0) continue

    rawSegments.push({
      startKm: previous.distanceKm,
      endKm: current.distanceKm,
      slopePct: ((current.elevationM - previous.elevationM) / (distanceKm * 1000)) * 100,
    })
  }

  const smoothed = smooth(rawSegments.map((segment) => segment.slopePct))

  return rawSegments.map((segment, index) => ({
    startKm: Math.round(segment.startKm * 100) / 100,
    endKm: Math.round(segment.endKm * 100) / 100,
    slopePct: smoothed[index],
    band: classifySlopeBand(smoothed[index]),
  }))
}

function buildRouteRenderMetadata(routeGeojson) {
  if (!routeGeojson) return null
  const previewPoints = extractPreviewPoints(routeGeojson)
  const hoverProfile = buildHoverProfile(routeGeojson)
  if (hoverProfile.length === 0) return null

  return {
    version: 1,
    bounds: computeBounds(previewPoints),
    hoverProfile,
    slopeSegments: buildSlopeSegments(hoverProfile).map(({ startKm, endKm, slopePct }) => ({
      startKm,
      endKm,
      slopePct,
    })),
  }
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
    .select('id, route_geojson')
    .not('route_geojson', 'is', null)

  if (error) {
    throw error
  }

  for (const course of data ?? []) {
    const metadata = buildRouteRenderMetadata(course.route_geojson)
    if (!metadata) continue

    const { error: updateError } = await supabase
      .from('courses')
      .update({ route_render_metadata: metadata })
      .eq('id', course.id)

    if (updateError) {
      throw updateError
    }
  }

  console.log(`Backfilled ${data?.length ?? 0} course rows with route_render_metadata.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
