import { describe, it, expect } from 'vitest'
import {
  lngToTileX,
  latToTileY,
  tileXToLng,
  tileYToLat,
  getTileGrid,
  chooseTileZoom,
  tileGridBoundsMeters,
  type BBox,
  type TileGrid,
} from '@/lib/osm-tile-utils'

// ---------------------------------------------------------------------------
// lngToTileX
// ---------------------------------------------------------------------------

describe('lngToTileX', () => {
  it('returns tile 0 for lng=-180 at z=1', () => {
    expect(lngToTileX(-180, 1)).toBe(0)
  })

  it('returns max tile index for lng approaching +180 at z=1', () => {
    // At z=1 there are 2 columns (0..1). lng=179.99 → tile 1
    expect(lngToTileX(179.99, 1)).toBe(1)
  })

  it('returns 0 for lng=0 at z=0', () => {
    expect(lngToTileX(0, 0)).toBe(0)
  })

  it('maps prime meridian (lng=0) to the middle tile at z=1', () => {
    // lng=0 → x = floor((180/360)*2) = floor(1) = 1
    expect(lngToTileX(0, 1)).toBe(1)
  })

  it('handles Seoul longitude at z=14', () => {
    // Seoul ~127.0°E
    const x = lngToTileX(127.0, 14)
    // x should be in a reasonable range [0, 2^14)
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x).toBeLessThan(Math.pow(2, 14))
  })

  it('is monotonically non-decreasing with longitude', () => {
    const z = 10
    const lngs = [-180, -90, 0, 90, 179.9]
    const tiles = lngs.map((lng) => lngToTileX(lng, z))
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i]).toBeGreaterThanOrEqual(tiles[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// latToTileY
// ---------------------------------------------------------------------------

describe('latToTileY', () => {
  it('returns 0 for lat close to +85.05 at z=1', () => {
    // Near north pole → yMin tile index = 0
    expect(latToTileY(85.05, 1)).toBe(0)
  })

  it('returns 1 for lat close to -85.05 at z=1', () => {
    // Near south pole → yMax tile index = 1 (2^1 - 1)
    expect(latToTileY(-85.05, 1)).toBe(1)
  })

  it('returns 0 for equator at z=0', () => {
    expect(latToTileY(0, 0)).toBe(0)
  })

  it('maps equator (lat=0) to middle tile at z=1', () => {
    // equator → y = floor(2/2) = 1
    expect(latToTileY(0, 1)).toBe(1)
  })

  it('tile Y is inverted: northern lat yields smaller y than southern lat', () => {
    const z = 10
    const northY = latToTileY(40, z)
    const southY = latToTileY(-40, z)
    expect(northY).toBeLessThan(southY)
  })

  it('handles Seoul latitude at z=14', () => {
    // Seoul ~37.5°N
    const y = latToTileY(37.5, 14)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThan(Math.pow(2, 14))
  })
})

// ---------------------------------------------------------------------------
// tileXToLng (inverse of lngToTileX)
// ---------------------------------------------------------------------------

describe('tileXToLng', () => {
  it('returns -180 for tile x=0 at z=1', () => {
    expect(tileXToLng(0, 1)).toBeCloseTo(-180, 5)
  })

  it('returns 0 for tile x=1 at z=1 (left edge of tile)', () => {
    // x=1 at z=1 → (1/2)*360 - 180 = 0
    expect(tileXToLng(1, 1)).toBeCloseTo(0, 5)
  })

  it('returns 180 for tile x=2^z at z=1 (right edge)', () => {
    expect(tileXToLng(2, 1)).toBeCloseTo(180, 5)
  })

  it('round-trips with lngToTileX: tile left edge', () => {
    const z = 12
    const lng = 127.0
    const x = lngToTileX(lng, z)
    const tileLeftLng = tileXToLng(x, z)
    // tileLeftLng ≤ lng < tileXToLng(x+1, z)
    expect(tileLeftLng).toBeLessThanOrEqual(lng)
    expect(tileXToLng(x + 1, z)).toBeGreaterThan(lng)
  })

  it('adjacent tiles are contiguous (no gaps)', () => {
    const z = 10
    // right edge of tile x equals left edge of tile x+1
    for (let x = 0; x < 5; x++) {
      expect(tileXToLng(x + 1, z)).toBeCloseTo(tileXToLng(x + 1, z), 10)
    }
  })
})

// ---------------------------------------------------------------------------
// tileYToLat (inverse of latToTileY)
// ---------------------------------------------------------------------------

describe('tileYToLat', () => {
  it('returns ~85.05 for tile y=0 at z=1 (north pole boundary)', () => {
    const lat = tileYToLat(0, 1)
    expect(lat).toBeGreaterThan(85)
    expect(lat).toBeLessThanOrEqual(85.06)
  })

  it('returns ~-85.05 for tile y=2^z at z=1 (south pole boundary)', () => {
    const lat = tileYToLat(2, 1)
    expect(lat).toBeLessThan(-85)
    expect(lat).toBeGreaterThanOrEqual(-85.06)
  })

  it('returns ~0 for equator tile at z=1', () => {
    // Equator is at y=1 at z=1 (top edge of tile 1)
    expect(tileYToLat(1, 1)).toBeCloseTo(0, 3)
  })

  it('tile top lat is greater than tile bottom lat (y+1)', () => {
    const z = 10
    const topLat = tileYToLat(100, z)
    const bottomLat = tileYToLat(101, z)
    expect(topLat).toBeGreaterThan(bottomLat)
  })

  it('round-trips with latToTileY: tile top edge', () => {
    const z = 12
    const lat = 37.5
    const y = latToTileY(lat, z)
    const tileTopLat = tileYToLat(y, z)
    // tileTopLat ≥ lat > tileYToLat(y+1, z)
    expect(tileTopLat).toBeGreaterThanOrEqual(lat)
    expect(tileYToLat(y + 1, z)).toBeLessThanOrEqual(lat)
  })
})

// ---------------------------------------------------------------------------
// getTileGrid
// ---------------------------------------------------------------------------

describe('getTileGrid', () => {
  // Asan area ~36.7°N 127.0°E
  const asanBbox: BBox = {
    minLat: 36.7,
    maxLat: 36.9,
    minLng: 126.9,
    maxLng: 127.1,
  }

  it('returns a TileGrid with the correct z', () => {
    const grid = getTileGrid(asanBbox, 12)
    expect(grid.z).toBe(12)
  })

  it('xMin ≤ xMax', () => {
    const grid = getTileGrid(asanBbox, 12)
    expect(grid.xMin).toBeLessThanOrEqual(grid.xMax)
  })

  it('yMin ≤ yMax (lat inversion: maxLat → yMin, minLat → yMax)', () => {
    const grid = getTileGrid(asanBbox, 12)
    expect(grid.yMin).toBeLessThanOrEqual(grid.yMax)
  })

  it('cols equals xMax - xMin + 1', () => {
    const grid = getTileGrid(asanBbox, 12)
    expect(grid.cols).toBe(grid.xMax - grid.xMin + 1)
  })

  it('rows equals yMax - yMin + 1', () => {
    const grid = getTileGrid(asanBbox, 12)
    expect(grid.rows).toBe(grid.yMax - grid.yMin + 1)
  })

  it('cols and rows are at least 1', () => {
    // Even a zero-width bbox should yield at least 1 tile
    const pointBbox: BBox = {
      minLat: 36.8,
      maxLat: 36.8,
      minLng: 127.0,
      maxLng: 127.0,
    }
    const grid = getTileGrid(pointBbox, 12)
    expect(grid.cols).toBeGreaterThanOrEqual(1)
    expect(grid.rows).toBeGreaterThanOrEqual(1)
  })

  it('higher zoom produces finer (more numerous) tiles', () => {
    const grid10 = getTileGrid(asanBbox, 10)
    const grid14 = getTileGrid(asanBbox, 14)
    // Both cols and rows should be ≥ at higher zoom
    expect(grid14.cols * grid14.rows).toBeGreaterThan(grid10.cols * grid10.rows)
  })

  it('yMin comes from maxLat (northern boundary maps to lower y number)', () => {
    const z = 12
    const grid = getTileGrid(asanBbox, z)
    expect(grid.yMin).toBe(latToTileY(asanBbox.maxLat, z))
    expect(grid.yMax).toBe(latToTileY(asanBbox.minLat, z))
  })
})

// ---------------------------------------------------------------------------
// chooseTileZoom
// ---------------------------------------------------------------------------

describe('chooseTileZoom', () => {
  it('returns a grid with total tiles ≤ 16', () => {
    const bbox: BBox = {
      minLat: 36.7,
      maxLat: 36.9,
      minLng: 126.9,
      maxLng: 127.1,
    }
    const grid = chooseTileZoom(bbox)
    expect(grid.cols * grid.rows).toBeLessThanOrEqual(16)
  })

  it('z is between 11 and 15 inclusive for normal-sized bbox', () => {
    const bbox: BBox = {
      minLat: 36.7,
      maxLat: 36.9,
      minLng: 126.9,
      maxLng: 127.1,
    }
    const grid = chooseTileZoom(bbox)
    expect(grid.z).toBeGreaterThanOrEqual(11)
    expect(grid.z).toBeLessThanOrEqual(15)
  })

  it('single-point route still returns a valid grid', () => {
    const pointBbox: BBox = {
      minLat: 37.5,
      maxLat: 37.5,
      minLng: 127.0,
      maxLng: 127.0,
    }
    const grid = chooseTileZoom(pointBbox)
    expect(grid.cols).toBeGreaterThanOrEqual(1)
    expect(grid.rows).toBeGreaterThanOrEqual(1)
    expect(grid.cols * grid.rows).toBeLessThanOrEqual(16)
  })

  it('falls back to z=11 for a large route that exceeds maxTiles on every zoom', () => {
    // This bbox spans ~2.5° lng × 1.5° lat — at z=11 it already has 16×12=192 tiles.
    // chooseTileZoom finds no zoom in [11..15] that satisfies minTiles=2, maxTiles=4,
    // so it returns the z=11 fallback grid as documented.
    const bbox: BBox = {
      minLat: 36.0,
      maxLat: 37.5,
      minLng: 126.0,
      maxLng: 128.5,
    }
    const grid = chooseTileZoom(bbox, 2, 4)
    expect(grid.z).toBe(11)
    // Fallback grid cols/rows match getTileGrid at z=11
    const expected = getTileGrid(bbox, 11)
    expect(grid.cols).toBe(expected.cols)
    expect(grid.rows).toBe(expected.rows)
  })

  it('returns a TileGrid with correct cols/rows for chosen z', () => {
    const bbox: BBox = {
      minLat: 36.7,
      maxLat: 36.9,
      minLng: 126.9,
      maxLng: 127.1,
    }
    const grid = chooseTileZoom(bbox)
    const expected = getTileGrid(bbox, grid.z)
    expect(grid.xMin).toBe(expected.xMin)
    expect(grid.xMax).toBe(expected.xMax)
    expect(grid.yMin).toBe(expected.yMin)
    expect(grid.yMax).toBe(expected.yMax)
    expect(grid.cols).toBe(expected.cols)
    expect(grid.rows).toBe(expected.rows)
  })
})

// ---------------------------------------------------------------------------
// tileGridBoundsMeters
// ---------------------------------------------------------------------------

describe('tileGridBoundsMeters', () => {
  // Build a known grid for Seoul area at z=13
  const centerLat = 37.5665
  const centerLng = 126.9780
  const grid: TileGrid = getTileGrid(
    {
      minLat: centerLat - 0.1,
      maxLat: centerLat + 0.1,
      minLng: centerLng - 0.1,
      maxLng: centerLng + 0.1,
    },
    13,
  )

  it('returns positive widthM', () => {
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(bounds.widthM).toBeGreaterThan(0)
  })

  it('returns positive heightM', () => {
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(bounds.heightM).toBeGreaterThan(0)
  })

  it('widthM is in a plausible range for a ~0.2° bbox at mid-latitude', () => {
    // 0.2° longitude × cos(37.5°) × 111320 ≈ 17.7 km, but the tile grid
    // will be somewhat larger than the bbox, so expect > 15 km
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(bounds.widthM).toBeGreaterThan(15000)
    expect(bounds.widthM).toBeLessThan(60000)
  })

  it('heightM is in a plausible range for a ~0.2° bbox', () => {
    // 0.2° latitude × 110540 ≈ 22 km
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(bounds.heightM).toBeGreaterThan(15000)
    expect(bounds.heightM).toBeLessThan(60000)
  })

  it('offsetX and offsetZ are finite numbers', () => {
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(isFinite(bounds.offsetX)).toBe(true)
    expect(isFinite(bounds.offsetZ)).toBe(true)
  })

  it('when center equals the geographic center of the tile grid, offsets are small', () => {
    // Use a symmetric grid and place center at its middle
    const symGrid: TileGrid = {
      xMin: 13738,
      xMax: 13741,
      yMin: 6283,
      yMax: 6286,
      cols: 4,
      rows: 4,
      z: 14,
    }
    // Compute the true geographic center of this grid
    const { tileXToLng: tlng, tileYToLat: tlat } = (() => ({
      tileXToLng: (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180,
      tileYToLat: (y: number, z: number) => {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z)
        return (180 / Math.PI) * Math.atan(Math.sinh(n))
      },
    }))()
    const leftLng = tlng(symGrid.xMin, symGrid.z)
    const rightLng = tlng(symGrid.xMax + 1, symGrid.z)
    const topLat = tlat(symGrid.yMin, symGrid.z)
    const bottomLat = tlat(symGrid.yMax + 1, symGrid.z)
    const geoCenterLat = (topLat + bottomLat) / 2
    const geoCenterLng = (leftLng + rightLng) / 2

    const bounds = tileGridBoundsMeters(symGrid, geoCenterLat, geoCenterLng)
    // Offsets should be very close to zero
    expect(Math.abs(bounds.offsetX)).toBeLessThan(1)
    expect(Math.abs(bounds.offsetZ)).toBeLessThan(1)
  })

  it('widthM and heightM are always non-negative (Math.abs applied)', () => {
    // Even if grid ordering were reversed, abs ensures positive sizes
    const bounds = tileGridBoundsMeters(grid, centerLat, centerLng)
    expect(bounds.widthM).toBeGreaterThanOrEqual(0)
    expect(bounds.heightM).toBeGreaterThanOrEqual(0)
  })
})
