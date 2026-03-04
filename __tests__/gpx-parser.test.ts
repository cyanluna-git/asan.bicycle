import { describe, it, expect } from 'vitest'
import { parseGpxToGeoJSON } from '@/lib/gpx-parser'
import { haversineKm } from '@/lib/validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(content: string, sizeBytes?: number): File {
  const blob = new Blob([content], { type: 'application/gpx+xml' })
  // Simulate oversized file by overriding size property
  if (sizeBytes !== undefined) {
    return Object.defineProperty(
      new File([content], 'route.gpx', { type: 'application/gpx+xml' }),
      'size',
      { value: sizeBytes },
    )
  }
  return new File([blob], 'route.gpx', { type: 'application/gpx+xml' })
}

/** Build a GPX XML string with a single track containing the given points.
 *  Each point is [lat, lon, ele?]. ele is omitted when undefined.
 */
function buildGpx(points: Array<{ lat: number; lon: number; ele?: number }>): string {
  const trkpts = points
    .map(({ lat, lon, ele }) => {
      const eleTag = ele !== undefined ? `<ele>${ele}</ele>` : ''
      return `      <trkpt lat="${lat}" lon="${lon}">${eleTag}</trkpt>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Test Route</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

// ---------------------------------------------------------------------------
// File size validation
// ---------------------------------------------------------------------------

describe('parseGpxToGeoJSON — file size', () => {
  it('throws when file size exceeds 10 MB', async () => {
    const oversized = makeFile('<gpx/>', 11 * 1024 * 1024)
    await expect(parseGpxToGeoJSON(oversized)).rejects.toThrow('10MB')
  })

  it('accepts a file exactly at the 10 MB limit', async () => {
    // Build a valid small GPX but mark size as exactly 10MB
    const gpxContent = buildGpx([
      { lat: 36.7897, lon: 127.002 },
      { lat: 36.7900, lon: 127.003 },
    ])
    const file = makeFile(gpxContent, 10 * 1024 * 1024)
    // Should not throw due to size (10MB <= 10MB)
    await expect(parseGpxToGeoJSON(file)).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Invalid GPX
// ---------------------------------------------------------------------------

describe('parseGpxToGeoJSON — invalid input', () => {
  it('throws on malformed XML', async () => {
    const file = makeFile('<this is not xml<<<')
    await expect(parseGpxToGeoJSON(file)).rejects.toThrow('유효한 GPX 파일이 아닙니다')
  })

  it('throws on valid XML with no track (no LineString)', async () => {
    const noTrack = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Empty</name></metadata>
</gpx>`
    const file = makeFile(noTrack)
    await expect(parseGpxToGeoJSON(file)).rejects.toThrow('경로 데이터가 없습니다')
  })
})

// ---------------------------------------------------------------------------
// 2D coordinates (no elevation)
// ---------------------------------------------------------------------------

describe('parseGpxToGeoJSON — 2D coordinates (no elevation)', () => {
  const points2D = [
    { lat: 36.7897, lon: 127.002 },
    { lat: 36.7910, lon: 127.005 },
    { lat: 36.7930, lon: 127.008 },
  ]

  it('parses successfully and returns a FeatureCollection', async () => {
    const file = makeFile(buildGpx(points2D))
    const result = await parseGpxToGeoJSON(file)
    expect(result.geojson.type).toBe('FeatureCollection')
    expect(result.geojson.features.length).toBeGreaterThan(0)
  })

  it('geometry coordinates are 2D [lng, lat] tuples', async () => {
    const file = makeFile(buildGpx(points2D))
    const result = await parseGpxToGeoJSON(file)
    const coords = result.geojson.features[0].geometry.coordinates
    // Each coordinate should have exactly 2 elements
    coords.forEach((c) => {
      expect(c).toHaveLength(2)
    })
  })

  it('elevation gain is 0 for 2D points (no elevation data)', async () => {
    const file = makeFile(buildGpx(points2D))
    const result = await parseGpxToGeoJSON(file)
    expect(result.elevationGainM).toBe(0)
  })

  it('start point matches first track point', async () => {
    const file = makeFile(buildGpx(points2D))
    const result = await parseGpxToGeoJSON(file)
    expect(result.startLat).toBeCloseTo(points2D[0].lat, 4)
    expect(result.startLng).toBeCloseTo(points2D[0].lon, 4)
  })

  it('distance is positive and roughly correct', async () => {
    const file = makeFile(buildGpx(points2D))
    const result = await parseGpxToGeoJSON(file)
    // Manual expected distance: sum of consecutive haversine distances
    const expected =
      haversineKm(points2D[0].lat, points2D[0].lon, points2D[1].lat, points2D[1].lon) +
      haversineKm(points2D[1].lat, points2D[1].lon, points2D[2].lat, points2D[2].lon)
    expect(result.distanceKm).toBeCloseTo(Math.round(expected * 10) / 10, 1)
  })
})

// ---------------------------------------------------------------------------
// 3D coordinates (with elevation)
// ---------------------------------------------------------------------------

describe('parseGpxToGeoJSON — 3D coordinates (with elevation)', () => {
  // Ascending then descending: gain = 30 + 20 = 50, loss ignored
  const points3D = [
    { lat: 36.7897, lon: 127.002, ele: 100 },
    { lat: 36.7910, lon: 127.005, ele: 130 }, // +30
    { lat: 36.7920, lon: 127.007, ele: 150 }, // +20
    { lat: 36.7930, lon: 127.008, ele: 120 }, // -30 (ignored)
  ]

  it('parses successfully', async () => {
    const file = makeFile(buildGpx(points3D))
    await expect(parseGpxToGeoJSON(file)).resolves.toBeDefined()
  })

  it('elevation gain sums only positive deltas', async () => {
    const file = makeFile(buildGpx(points3D))
    const result = await parseGpxToGeoJSON(file)
    // +30 + 20 = 50 m gain
    expect(result.elevationGainM).toBe(50)
  })

  it('geometry coordinates are stripped to 2D even from 3D input', async () => {
    const file = makeFile(buildGpx(points3D))
    const result = await parseGpxToGeoJSON(file)
    const coords = result.geojson.features[0].geometry.coordinates
    coords.forEach((c) => {
      expect(c).toHaveLength(2)
    })
  })

  it('handles flat 3D track with no elevation gain', async () => {
    const flat3D = [
      { lat: 36.7897, lon: 127.002, ele: 50 },
      { lat: 36.7910, lon: 127.005, ele: 50 },
      { lat: 36.7920, lon: 127.007, ele: 50 },
    ]
    const file = makeFile(buildGpx(flat3D))
    const result = await parseGpxToGeoJSON(file)
    expect(result.elevationGainM).toBe(0)
  })

  it('handles purely descending track with no elevation gain', async () => {
    const descending = [
      { lat: 36.7897, lon: 127.002, ele: 300 },
      { lat: 36.7910, lon: 127.005, ele: 200 },
      { lat: 36.7920, lon: 127.007, ele: 100 },
    ]
    const file = makeFile(buildGpx(descending))
    const result = await parseGpxToGeoJSON(file)
    expect(result.elevationGainM).toBe(0)
  })

  it('distance calculation uses only lng/lat (ignores elevation)', async () => {
    const file = makeFile(buildGpx(points3D))
    const result = await parseGpxToGeoJSON(file)
    // Manual expected: sum of haversine between consecutive points
    const expected =
      haversineKm(points3D[0].lat, points3D[0].lon, points3D[1].lat, points3D[1].lon) +
      haversineKm(points3D[1].lat, points3D[1].lon, points3D[2].lat, points3D[2].lon) +
      haversineKm(points3D[2].lat, points3D[2].lon, points3D[3].lat, points3D[3].lon)
    expect(result.distanceKm).toBeCloseTo(Math.round(expected * 10) / 10, 1)
  })
})

// ---------------------------------------------------------------------------
// Single-point and minimal edge cases
// ---------------------------------------------------------------------------

describe('parseGpxToGeoJSON — edge cases', () => {
  it('single trkpt produces no LineString — throws "경로 데이터가 없습니다"', async () => {
    // @tmcw/togeojson converts a single trkpt to a Point geometry, not a LineString,
    // so the parser correctly rejects it as having no route data.
    const singlePoint = [{ lat: 36.7897, lon: 127.002, ele: 50 }]
    const file = makeFile(buildGpx(singlePoint))
    await expect(parseGpxToGeoJSON(file)).rejects.toThrow('경로 데이터가 없습니다')
  })

  it('two-point track: distance > 0 and elevation gain calculated correctly', async () => {
    const twoPoints = [
      { lat: 36.7897, lon: 127.002, ele: 100 },
      { lat: 36.7910, lon: 127.005, ele: 150 }, // +50 m gain
    ]
    const file = makeFile(buildGpx(twoPoints))
    const result = await parseGpxToGeoJSON(file)
    expect(result.distanceKm).toBeGreaterThan(0)
    expect(result.elevationGainM).toBe(50)
  })
})
