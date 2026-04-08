'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import {
  classifySlopeBand,
  SLOPE_BANDS,
} from '@/lib/slope-visualization'
import { getPoiMeta } from '@/lib/poi'
import type { RouteGeoJSON, UphillSegment, PoiMapItem, CourseAlbumPhoto, RouteHoverPoint } from '@/types/course'

interface Route3DProfileProps {
  routeGeoJSON: RouteGeoJSON
  verticalExaggeration: number
  uphillSegments?: UphillSegment[]
  pois?: PoiMapItem[]
  albumPhotos?: CourseAlbumPhoto[]
  hoverProfile?: RouteHoverPoint[]
}

type Coord3 = { lng: number; lat: number; ele: number }

const SCENE_BG = 0xffffff
const RIBBON_HALF_WIDTH = 10

// Brighter color palette for 3D rendering
const SLOPE_COLORS_3D: Record<string, number> = {
  descent: 0xc8d8e8,
  flat:    0x4ade80,
  gentle:  0xfcd34d,
  moderate:0xfb923c,
  steep:   0xf87171,
  extreme: 0xff3030,
}

function extractCoords(geojson: RouteGeoJSON): Coord3[] {
  const coords: Coord3[] = []
  for (const feature of geojson.features) {
    if (feature.geometry?.type !== 'LineString') continue
    for (const c of feature.geometry.coordinates) {
      coords.push({ lng: c[0], lat: c[1], ele: c[2] ?? 0 })
    }
  }
  return coords
}

function douglasPeucker(points: Coord3[], epsilon: number): Coord3[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const first = points[0]
  const last = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}

function perpendicularDistance(p: Coord3, a: Coord3, b: Coord3): number {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const dz = b.ele - a.ele
  const lenSq = dx * dx + dy * dy + dz * dz
  if (lenSq === 0) {
    const ex = p.lng - a.lng
    const ey = p.lat - a.lat
    const ez = p.ele - a.ele
    return Math.sqrt(ex * ex + ey * ey + ez * ez)
  }
  const t = Math.max(0, Math.min(1,
    ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy + (p.ele - a.ele) * dz) / lenSq,
  ))
  const projX = a.lng + t * dx
  const projY = a.lat + t * dy
  const projZ = a.ele + t * dz
  const ex = p.lng - projX
  const ey = p.lat - projY
  const ez = p.ele - projZ
  return Math.sqrt(ex * ex + ey * ey + ez * ez)
}

function downsample(coords: Coord3[], maxPoints: number): Coord3[] {
  if (coords.length <= maxPoints) return coords
  let epsilon = 0.00001
  let result = coords
  for (let iter = 0; iter < 20; iter++) {
    result = douglasPeucker(coords, epsilon)
    if (result.length <= maxPoints) break
    epsilon *= 2
  }
  return result
}

function toLocal(coords: Coord3[]): { x: number; y: number; ele: number }[] {
  if (coords.length === 0) return []

  const centerLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length
  const centerLng = coords.reduce((s, c) => s + c.lng, 0) / coords.length
  const cosLat = Math.cos((centerLat * Math.PI) / 180)

  return coords.map((c) => ({
    x: (c.lng - centerLng) * cosLat * 111320,
    y: (c.lat - centerLat) * 110540,
    ele: c.ele,
  }))
}

/** Convert lat/lng to local XZ scene coordinates using a stored center. */
function latLngToLocal(lat: number, lng: number, centerLat: number, centerLng: number) {
  const cosLat = Math.cos((centerLat * Math.PI) / 180)
  return {
    x: (lng - centerLng) * cosLat * 111320,
    z: (lat - centerLat) * 110540,
  }
}

function slopeColor(slopePct: number): THREE.Color {
  const band = classifySlopeBand(slopePct)
  return new THREE.Color(SLOPE_COLORS_3D[band] ?? SLOPE_BANDS[band].color)
}

function buildRibbonGeometry(
  localPoints: { x: number; y: number; ele: number }[],
  vScale: number,
): THREE.BufferGeometry {
  const n = localPoints.length
  if (n < 2) {
    return new THREE.BufferGeometry()
  }

  const vertCount = n * 4
  // 3 faces (top, left wall, right wall) × 2 triangles × 3 vertices = 18 indices per segment
  const segCount = n - 1
  const positions = new Float32Array(vertCount * 3)
  const colors = new Float32Array(vertCount * 3)
  const indices = new Uint32Array(segCount * 18)

  for (let i = 0; i < n; i++) {
    const p = localPoints[i]
    let dx: number, dy: number

    if (i < n - 1) {
      dx = localPoints[i + 1].x - p.x
      dy = localPoints[i + 1].y - p.y
    } else {
      dx = p.x - localPoints[i - 1].x
      dy = p.y - localPoints[i - 1].y
    }

    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = -dy / len
    const ny = dx / len

    const ox = nx * RIBBON_HALF_WIDTH
    const oy = ny * RIBBON_HALF_WIDTH
    const z = p.ele * vScale

    // Top-left, top-right (at elevation)
    const base = i * 4
    positions[(base + 0) * 3 + 0] = p.x - ox
    positions[(base + 0) * 3 + 1] = z
    positions[(base + 0) * 3 + 2] = p.y - oy

    positions[(base + 1) * 3 + 0] = p.x + ox
    positions[(base + 1) * 3 + 1] = z
    positions[(base + 1) * 3 + 2] = p.y + oy

    // Bottom-left, bottom-right (at ground)
    positions[(base + 2) * 3 + 0] = p.x - ox
    positions[(base + 2) * 3 + 1] = 0
    positions[(base + 2) * 3 + 2] = p.y - oy

    positions[(base + 3) * 3 + 0] = p.x + ox
    positions[(base + 3) * 3 + 1] = 0
    positions[(base + 3) * 3 + 2] = p.y + oy

    // Slope color for this segment
    let slope = 0
    if (i < n - 1) {
      const distM = Math.sqrt(
        (localPoints[i + 1].x - p.x) ** 2 + (localPoints[i + 1].y - p.y) ** 2,
      )
      if (distM > 0) {
        slope = ((localPoints[i + 1].ele - p.ele) / distM) * 100
      }
    } else if (i > 0) {
      const distM = Math.sqrt(
        (p.x - localPoints[i - 1].x) ** 2 + (p.y - localPoints[i - 1].y) ** 2,
      )
      if (distM > 0) {
        slope = ((p.ele - localPoints[i - 1].ele) / distM) * 100
      }
    }

    const col = slopeColor(slope)
    for (let v = 0; v < 4; v++) {
      colors[(base + v) * 3 + 0] = col.r
      colors[(base + v) * 3 + 1] = col.g
      colors[(base + v) * 3 + 2] = col.b
    }
  }

  // Indices: quads between consecutive cross-sections
  let idx = 0
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4
    const b = (i + 1) * 4

    // Top ribbon face: a0, a1, b0 / b0, a1, b1
    indices[idx++] = a + 0; indices[idx++] = a + 1; indices[idx++] = b + 0
    indices[idx++] = b + 0; indices[idx++] = a + 1; indices[idx++] = b + 1

    // Left wall: a0, b0, a2 / a2, b0, b2
    indices[idx++] = a + 0; indices[idx++] = b + 0; indices[idx++] = a + 2
    indices[idx++] = a + 2; indices[idx++] = b + 0; indices[idx++] = b + 2

    // Right wall: a1, a3, b1 / b1, a3, b3
    indices[idx++] = a + 1; indices[idx++] = a + 3; indices[idx++] = b + 1
    indices[idx++] = b + 1; indices[idx++] = a + 3; indices[idx++] = b + 3
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()

  return geometry
}

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

/** Find the nearest point in a hover profile by distanceKm. */
function findNearestInProfile(
  profile: RouteHoverPoint[],
  targetKm: number,
): RouteHoverPoint {
  let nearest = profile[0]
  let nearestDelta = Math.abs(nearest.distanceKm - targetKm)
  for (let i = 1; i < profile.length; i++) {
    const delta = Math.abs(profile[i].distanceKm - targetKm)
    if (delta < nearestDelta) {
      nearest = profile[i]
      nearestDelta = delta
    }
  }
  return nearest
}

export function Route3DProfile({
  routeGeoJSON,
  verticalExaggeration,
  uphillSegments = [],
  pois = [],
  albumPhotos = [],
  hoverProfile = [],
}: Route3DProfileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer
    css2dRenderer: CSS2DRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    mesh: THREE.Mesh
    material: THREE.MeshLambertMaterial
    grid: THREE.GridHelper
    frameId: number
    resizeObserver: ResizeObserver
    localPoints: { x: number; y: number; ele: number }[]
    centerLat: number
    centerLng: number
  } | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)

  // CSS2DObjects we added — tracked outside sceneStateRef so label effects can clean up
  const uphillLabelsRef = useRef<CSS2DObject[]>([])
  const poiLabelsRef = useRef<CSS2DObject[]>([])
  const albumLabelsRef = useRef<CSS2DObject[]>([])
  const startFinishLabelsRef = useRef<CSS2DObject[]>([])

  // Initialize scene on mount, tear down on unmount
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!isWebGLAvailable()) {
      setWebglFailed(true)
      return
    }

    const width = container.clientWidth
    const height = container.clientHeight

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SCENE_BG)

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 100000)

    // WebGL renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

    // CSS2D renderer (label overlay)
    const css2dRenderer = new CSS2DRenderer()
    css2dRenderer.setSize(width, height)
    css2dRenderer.domElement.style.position = 'absolute'
    css2dRenderer.domElement.style.top = '0'
    css2dRenderer.domElement.style.left = '0'
    css2dRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(css2dRenderer.domElement)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambient)
    const directional = new THREE.DirectionalLight(0xffffff, 0.8)
    directional.position.set(1, 2, 1).normalize()
    scene.add(directional)

    // Extract & downsample coordinates
    const rawCoords = extractCoords(routeGeoJSON)
    const coords = downsample(rawCoords, 2000)

    // Compute center for lat/lng → local conversion
    const centerLat = coords.reduce((s, c) => s + c.lat, 0) / (coords.length || 1)
    const centerLng = coords.reduce((s, c) => s + c.lng, 0) / (coords.length || 1)

    const localPoints = toLocal(coords)

    // Build mesh
    const geometry = buildRibbonGeometry(localPoints, verticalExaggeration)
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Compute bounding box for grid + camera
    geometry.computeBoundingBox()
    const box = geometry.boundingBox ?? new THREE.Box3()
    const center = new THREE.Vector3()
    box.getCenter(center)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z, 100)

    // Grid — denser divisions
    const gridSize = Math.ceil(maxDim * 1.5 / 100) * 100
    const gridDivisions = Math.max(40, Math.ceil(gridSize / 500) * 20)
    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0xbbbbbb, 0xdddddd)
    grid.position.set(center.x, 0, center.z)
    scene.add(grid)

    // Compass direction labels (N/S/E/W)
    const halfGrid = gridSize / 2
    const compassDefs = [
      { label: 'N', x: center.x,           z: center.z + halfGrid * 0.95 },
      { label: 'S', x: center.x,           z: center.z - halfGrid * 0.95 },
      { label: 'E', x: center.x + halfGrid * 0.95, z: center.z },
      { label: 'W', x: center.x - halfGrid * 0.95, z: center.z },
    ]
    const compassObjects: CSS2DObject[] = []
    for (const { label, x, z } of compassDefs) {
      const div = document.createElement('div')
      div.textContent = label
      div.style.cssText = 'font-size:13px;font-weight:700;color:#888;opacity:0.7;pointer-events:none;'
      const obj = new CSS2DObject(div)
      obj.position.set(x, 0, z)
      scene.add(obj)
      compassObjects.push(obj)
    }

    // Floor mirror — faint reflection below ground
    const mirrorGeo = new THREE.PlaneGeometry(gridSize, gridSize)
    mirrorGeo.rotateX(-Math.PI / 2)
    const mirrorMat = new THREE.MeshBasicMaterial({
      color: 0xe8eef4,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
    const mirrorPlane = new THREE.Mesh(mirrorGeo, mirrorMat)
    mirrorPlane.position.set(center.x, -1, center.z)
    scene.add(mirrorPlane)

    // Reflected ribbon — flipped Y, very faint
    const mirrorMesh = mesh.clone()
    mirrorMesh.scale.set(1, -1, 1)
    mirrorMesh.position.y = -2
    const mirrorRibbonMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
    })
    mirrorMesh.material = mirrorRibbonMat
    scene.add(mirrorMesh)

    // Position camera
    camera.position.set(
      center.x + maxDim * 0.8,
      maxDim * 0.6,
      center.z + maxDim * 0.8,
    )
    controls.target.copy(center)
    controls.update()

    // Handle resize
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      if (w === 0 || h === 0) return
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      css2dRenderer.setSize(w, h)
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    // Animation loop
    const frameIdRef = { current: 0 }
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      css2dRenderer.render(scene, camera)
    }
    animate()

    // Store state for exaggeration updates
    sceneStateRef.current = {
      renderer,
      css2dRenderer,
      scene,
      camera,
      controls,
      mesh,
      material,
      grid,
      frameId: frameIdRef.current,
      resizeObserver,
      localPoints,
      centerLat,
      centerLng,
    }

    return () => {
      const state = sceneStateRef.current
      if (state) {
        cancelAnimationFrame(frameIdRef.current)
        state.resizeObserver.disconnect()
        state.controls.dispose()
        state.mesh.geometry.dispose()
        state.material.dispose()
        state.grid.geometry.dispose()
        ;(state.grid.material as THREE.Material).dispose()
        mirrorPlane.geometry.dispose()
        mirrorMat.dispose()
        mirrorRibbonMat.dispose()
        for (const obj of compassObjects) scene.remove(obj)
        state.renderer.dispose()
        if (container.contains(state.renderer.domElement)) {
          container.removeChild(state.renderer.domElement)
        }
        if (container.contains(state.css2dRenderer.domElement)) {
          container.removeChild(state.css2dRenderer.domElement)
        }
        sceneStateRef.current = null
      }
    }
    // Scene init only depends on routeGeoJSON; verticalExaggeration handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGeoJSON])

  // Update ribbon geometry when verticalExaggeration changes
  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return
    if (state.localPoints.length < 2) return

    state.mesh.geometry.dispose()
    const geometry = buildRibbonGeometry(state.localPoints, verticalExaggeration)
    state.mesh.geometry = geometry
  }, [verticalExaggeration])

  // Uphill labels — rebuild when uphillSegments, hoverProfile, or verticalExaggeration change
  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return

    // Remove previous uphill labels
    for (const obj of uphillLabelsRef.current) {
      state.scene.remove(obj)
    }
    uphillLabelsRef.current = []

    if (!uphillSegments.length || !hoverProfile.length || !state.localPoints.length) return

    for (const seg of uphillSegments) {
      const endPt = findNearestInProfile(hoverProfile, seg.end_km)
      const startPt = findNearestInProfile(hoverProfile, seg.start_km)
      const distM = (seg.end_km - seg.start_km) * 1000
      const grade = distM > 0 ? ((endPt.elevationM - startPt.elevationM) / distM) * 100 : 0

      const { x, z } = latLngToLocal(endPt.lat, endPt.lng, state.centerLat, state.centerLng)
      const y = endPt.elevationM * verticalExaggeration

      // Outer wrapper: 1×1px anchor point; CSS2DRenderer centers it at the 3D summit
      const div = document.createElement('div')
      div.style.cssText = 'pointer-events:none;position:relative;width:1px;height:1px'

      // Label + tail above the anchor
      const tag = document.createElement('div')
      tag.style.cssText =
        'position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;width:max-content'

      const box = document.createElement('div')
      box.style.cssText =
        'background:white;color:#f97316;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.18);white-space:nowrap;line-height:1.4;text-align:center;border:1px solid #fed7aa'
      const distKm = (seg.end_km - seg.start_km).toFixed(1)
      if (seg.name) {
        box.innerHTML = `<div style="font-size:10px;font-weight:500;color:#9a3412">${seg.name}</div><div>▲ ${grade.toFixed(1)}% · ${distKm}km</div>`
      } else {
        box.textContent = `▲ ${grade.toFixed(1)}% · ${distKm}km`
      }

      const tail = document.createElement('div')
      tail.style.cssText = 'width:1.5px;height:10px;background:#f97316;opacity:0.55'

      tag.appendChild(box)
      tag.appendChild(tail)

      // Dot at the summit anchor
      const dot = document.createElement('div')
      dot.style.cssText =
        'position:absolute;top:-4px;left:-4px;width:7px;height:7px;border-radius:50%;background:#f97316;border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25)'

      div.appendChild(tag)
      div.appendChild(dot)

      const obj = new CSS2DObject(div)
      obj.position.set(x, y, z)
      state.scene.add(obj)
      uphillLabelsRef.current.push(obj)
    }

    return () => {
      const currentState = sceneStateRef.current
      if (!currentState) return
      for (const obj of uphillLabelsRef.current) {
        currentState.scene.remove(obj)
      }
      uphillLabelsRef.current = []
    }
  }, [uphillSegments, hoverProfile, verticalExaggeration])

  // POI labels — rebuild when pois change
  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return

    for (const obj of poiLabelsRef.current) {
      state.scene.remove(obj)
    }
    poiLabelsRef.current = []

    if (!pois.length) return

    for (const poi of pois) {
      const { x, z } = latLngToLocal(poi.lat, poi.lng, state.centerLat, state.centerLng)
      const meta = getPoiMeta(poi.category)

      const div = document.createElement('div')
      div.style.cssText =
        'background:white;color:#374151;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;pointer-events:none'
      div.textContent = `${meta.emoji} ${poi.name}`

      const obj = new CSS2DObject(div)
      obj.position.set(x, 0, z)
      state.scene.add(obj)
      poiLabelsRef.current.push(obj)
    }

    return () => {
      const currentState = sceneStateRef.current
      if (!currentState) return
      for (const obj of poiLabelsRef.current) {
        currentState.scene.remove(obj)
      }
      poiLabelsRef.current = []
    }
  }, [pois])

  // Album photo labels — rebuild when albumPhotos change
  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return

    for (const obj of albumLabelsRef.current) {
      state.scene.remove(obj)
    }
    albumLabelsRef.current = []

    const geotagged = albumPhotos.filter(
      (p) => p.lat !== null && p.lng !== null,
    )
    if (!geotagged.length) return

    for (const photo of geotagged) {
      // lat/lng already confirmed non-null by filter above
      const { x, z } = latLngToLocal(
        photo.lat as number,
        photo.lng as number,
        state.centerLat,
        state.centerLng,
      )

      const div = document.createElement('div')
      div.style.cssText =
        'background:white;color:#374151;padding:2px 5px;border-radius:4px;font-size:12px;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;pointer-events:none'
      div.textContent = '📷'

      const obj = new CSS2DObject(div)
      obj.position.set(x, 0, z)
      state.scene.add(obj)
      albumLabelsRef.current.push(obj)
    }

    return () => {
      const currentState = sceneStateRef.current
      if (!currentState) return
      for (const obj of albumLabelsRef.current) {
        currentState.scene.remove(obj)
      }
      albumLabelsRef.current = []
    }
  }, [albumPhotos])

  // Start / Finish flag labels — rebuild when hoverProfile or verticalExaggeration change
  useEffect(() => {
    const state = sceneStateRef.current
    if (!state) return

    for (const obj of startFinishLabelsRef.current) {
      state.scene.remove(obj)
    }
    startFinishLabelsRef.current = []

    if (!hoverProfile.length) return

    const flags: { pt: (typeof hoverProfile)[0]; label: string; color: string; dotColor: string }[] = [
      { pt: hoverProfile[0], label: '출발', color: '#16a34a', dotColor: '#16a34a' },
      { pt: hoverProfile[hoverProfile.length - 1], label: '도착', color: '#dc2626', dotColor: '#dc2626' },
    ]

    for (const { pt, label, color, dotColor } of flags) {
      const { x, z } = latLngToLocal(pt.lat, pt.lng, state.centerLat, state.centerLng)
      const y = pt.elevationM * verticalExaggeration

      const div = document.createElement('div')
      div.style.cssText = 'pointer-events:none;position:relative;width:1px;height:1px'

      const tag = document.createElement('div')
      tag.style.cssText =
        'position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;width:max-content'

      const box = document.createElement('div')
      box.style.cssText = `background:white;color:${color};padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.18);white-space:nowrap;border:1px solid ${color}40;line-height:1.4;text-align:center`
      box.textContent = label

      const tail = document.createElement('div')
      tail.style.cssText = `width:1.5px;height:10px;background:${color};opacity:0.55`

      tag.appendChild(box)
      tag.appendChild(tail)

      const dot = document.createElement('div')
      dot.style.cssText = `position:absolute;top:-4px;left:-4px;width:7px;height:7px;border-radius:50%;background:${dotColor};border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25)`

      div.appendChild(tag)
      div.appendChild(dot)

      const obj = new CSS2DObject(div)
      obj.position.set(x, y, z)
      state.scene.add(obj)
      startFinishLabelsRef.current.push(obj)
    }

    return () => {
      const currentState = sceneStateRef.current
      if (!currentState) return
      for (const obj of startFinishLabelsRef.current) {
        currentState.scene.remove(obj)
      }
      startFinishLabelsRef.current = []
    }
  }, [hoverProfile, verticalExaggeration])

  if (webglFailed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        WebGL을 사용할 수 없는 브라우저입니다. 다른 브라우저에서 시도해주세요.
      </div>
    )
  }

  return <div ref={containerRef} className="relative h-full w-full" />
}
