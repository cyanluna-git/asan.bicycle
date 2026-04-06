/** Web Mercator tile coordinate utilities for OSM tile compositing */

export type BBox = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export type TileGrid = {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  cols: number
  rows: number
  z: number
}

export type TileGridBoundsMeters = {
  widthM: number
  heightM: number
  offsetX: number
  offsetZ: number
}

export function lngToTileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z))
}

export function latToTileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, z),
  )
}

export function tileXToLng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z)
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

export function getTileGrid(bbox: BBox, z: number): TileGrid {
  const xMin = lngToTileX(bbox.minLng, z)
  const xMax = lngToTileX(bbox.maxLng, z)
  // Note: lat tile Y is inverted (higher lat = lower tile Y number)
  const yMin = latToTileY(bbox.maxLat, z)
  const yMax = latToTileY(bbox.minLat, z)
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    cols: xMax - xMin + 1,
    rows: yMax - yMin + 1,
    z,
  }
}

/**
 * Choose a zoom level such that the tile grid is between minTiles and maxTiles
 * per axis (2x2 to 4x4 by default). Searches z=15 down to z=11.
 * Hard cap: total tiles <= 16.
 */
export function chooseTileZoom(
  bbox: BBox,
  minTiles = 2,
  maxTiles = 4,
): TileGrid {
  for (let z = 15; z >= 11; z--) {
    const grid = getTileGrid(bbox, z)
    if (
      grid.cols >= minTiles &&
      grid.cols <= maxTiles &&
      grid.rows >= minTiles &&
      grid.rows <= maxTiles &&
      grid.cols * grid.rows <= 16
    ) {
      return grid
    }
  }
  // Fallback: use z=11 and clamp if needed
  const grid = getTileGrid(bbox, 11)
  if (grid.cols * grid.rows > 16) {
    // Lower z until total tiles fits (shouldn't happen at z=11 for reasonable routes)
    return { ...grid, z: 11 }
  }
  return grid
}

/**
 * Convert tile grid corners to local meter offsets relative to the route centroid.
 * Uses the same simple Mercator approximation as toLocal() in route-3d-profile.tsx:
 *   x = (lng - centerLng) * cosLat * 111320
 *   z = (lat - centerLat) * 110540
 *
 * Returns widthM / heightM (plane geometry size) and offsetX / offsetZ
 * (center of the tile grid relative to the scene centroid).
 */
export function tileGridBoundsMeters(
  grid: TileGrid,
  centerLat: number,
  centerLng: number,
): TileGridBoundsMeters {
  const cosLat = Math.cos((centerLat * Math.PI) / 180)

  // Tile grid covers [xMin, xMax+1) and [yMin, yMax+1) in tile space
  const leftLng = tileXToLng(grid.xMin, grid.z)
  const rightLng = tileXToLng(grid.xMax + 1, grid.z)
  const topLat = tileYToLat(grid.yMin, grid.z)
  const bottomLat = tileYToLat(grid.yMax + 1, grid.z)

  const leftX = (leftLng - centerLng) * cosLat * 111320
  const rightX = (rightLng - centerLng) * cosLat * 111320
  const topZ = (topLat - centerLat) * 110540
  const bottomZ = (bottomLat - centerLat) * 110540

  const widthM = rightX - leftX
  // heightM in Three.js Z axis: topZ > bottomZ (north > south in local space)
  const heightM = topZ - bottomZ

  // Center of the tile grid in local meter space
  const offsetX = (leftX + rightX) / 2
  const offsetZ = (topZ + bottomZ) / 2

  return {
    widthM: Math.abs(widthM),
    heightM: Math.abs(heightM),
    offsetX,
    offsetZ,
  }
}
