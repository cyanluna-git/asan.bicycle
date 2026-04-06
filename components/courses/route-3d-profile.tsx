'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  classifySlopeBand,
  SLOPE_BANDS,
} from '@/lib/slope-visualization'
import type { RouteGeoJSON } from '@/types/course'

interface Route3DProfileProps {
  routeGeoJSON: RouteGeoJSON
  verticalExaggeration: number
}

type Coord3 = { lng: number; lat: number; ele: number }

const SCENE_BG = 0xffffff
const RIBBON_HALF_WIDTH = 10

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

function slopeColor(slopePct: number): THREE.Color {
  const band = classifySlopeBand(slopePct)
  return new THREE.Color(SLOPE_BANDS[band].color)
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

export function Route3DProfile({ routeGeoJSON, verticalExaggeration }: Route3DProfileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    mesh: THREE.Mesh
    material: THREE.MeshLambertMaterial
    grid: THREE.GridHelper
    frameId: number
    resizeObserver: ResizeObserver
    localPoints: { x: number; y: number; ele: number }[]
  } | null>(null)
  const [webglFailed, setWebglFailed] = useState(false)

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

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    container.appendChild(renderer.domElement)

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

    // Grid
    const gridSize = Math.ceil(maxDim * 1.5 / 100) * 100
    const grid = new THREE.GridHelper(gridSize, 20, 0xcccccc, 0xe0e0e0)
    grid.position.set(center.x, 0, center.z)
    scene.add(grid)

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
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(container)

    // Animation loop — use a ref cell so cancelAnimationFrame always sees the latest frame ID
    const frameIdRef = { current: 0 }
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Store state for exaggeration updates
    sceneStateRef.current = {
      renderer,
      scene,
      camera,
      controls,
      mesh,
      material,
      grid,
      frameId: frameIdRef.current,
      resizeObserver,
      localPoints,
    }

    return () => {
      const state = sceneStateRef.current
      if (state) {
        cancelAnimationFrame(frameIdRef.current)
        state.resizeObserver.disconnect()
        state.controls.dispose()
        state.mesh.geometry.dispose()
        state.material.dispose()
        state.renderer.dispose()
        if (container.contains(state.renderer.domElement)) {
          container.removeChild(state.renderer.domElement)
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

  if (webglFailed) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        WebGL을 사용할 수 없는 브라우저입니다. 다른 브라우저에서 시도해주세요.
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" />
}
