import type { Json } from '@/types/database'

export type Difficulty = 'easy' | 'moderate' | 'hard'

export type StartPointRow = {
  id: string
  name: string
  location: unknown
}

export type StartPointOption = {
  id: string
  name: string
  lat: number
  lng: number
}

export type PoiDraft = {
  id: string
  persistedId: string | null
  name: string
  category: string
  description: string
  lat: number | null
  lng: number | null
  photoUrl: string | null
  photoFile: File | null
  photoPreviewUrl: string | null
}

export type UploadMetadataFormData = {
  title: string
  description: string
  difficulty: Difficulty
  theme: string
  tags: string
  startPointId: string
}

export type MetadataHistoryEntry = {
  type: 'create' | 'edit'
  actorUserId: string
  actorDisplayName: string
  timestamp: string
  values: {
    title: string
    description: string | null
    difficulty: Difficulty
    theme: string | null
    tags: string[]
    start_point_id: string | null
  }
}

function parseGeoJsonPoint(location: { coordinates?: unknown }) {
  if (!Array.isArray(location.coordinates) || location.coordinates.length < 2) {
    return null
  }

  const [lng, lat] = location.coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null
  }

  return { lat, lng }
}

function parseWktPoint(location: string) {
  const match = location.match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i)
  if (!match) {
    return null
  }

  const lng = Number(match[1])
  const lat = Number(match[2])

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null
  }

  return { lat, lng }
}

export function parseStartPointLocation(location: unknown) {
  if (!location) return null

  if (typeof location === 'string') {
    return parseWktPoint(location)
  }

  if (typeof location === 'object') {
    return parseGeoJsonPoint(location as { coordinates?: unknown })
  }

  return null
}

export function buildStartPointOptions(rows: StartPointRow[]) {
  return rows
    .map((row) => {
      const coords = parseStartPointLocation(row.location)
      if (!coords) return null

      return {
        id: row.id,
        name: row.name,
        ...coords,
      }
    })
    .filter((row): row is StartPointOption => row !== null)
}

function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadiusKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

export function recommendStartPoint(
  startLat: number,
  startLng: number,
  options: StartPointOption[],
) {
  if (options.length === 0) {
    return null
  }

  return options.reduce((closest, option) => {
    const distance = haversineKm(startLat, startLng, option.lat, option.lng)
    if (!closest || distance < closest.distanceKm) {
      return {
        id: option.id,
        name: option.name,
        distanceKm: distance,
      }
    }

    return closest
  }, null as { id: string; name: string; distanceKm: number } | null)
}

export function createEmptyPoiDraft(): PoiDraft {
  return {
    id: crypto.randomUUID(),
    persistedId: null,
    name: '',
    category: 'other',
    description: '',
    lat: null,
    lng: null,
    photoUrl: null,
    photoFile: null,
    photoPreviewUrl: null,
  }
}

export function buildPoiDraftFromRecord({
  id,
  name,
  category,
  description,
  photo_url,
  lat,
  lng,
}: {
  id: string
  name: string
  category: string | null
  description: string | null
  photo_url: string | null
  lat: number
  lng: number
}): PoiDraft {
  return {
    id: crypto.randomUUID(),
    persistedId: id,
    name,
    category: category ?? 'other',
    description: description ?? '',
    lat,
    lng,
    photoUrl: photo_url,
    photoFile: null,
    photoPreviewUrl: photo_url,
  }
}

export function isObjectUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('blob:')
}

export function buildMetadataHistoryEntry({
  actorDisplayName,
  actorUserId,
  form,
  tags,
  type = 'create',
}: {
  actorDisplayName: string
  actorUserId: string
  form: UploadMetadataFormData
  tags: string[]
  type?: MetadataHistoryEntry['type']
}): MetadataHistoryEntry {
  return {
    type,
    actorUserId,
    actorDisplayName,
    timestamp: new Date().toISOString(),
    values: {
      title: form.title.trim(),
      description: form.description.trim() || null,
      difficulty: form.difficulty,
      theme: form.theme.trim() || null,
      tags,
      start_point_id: form.startPointId || null,
    },
  }
}

export function toMetadataHistoryJson(entry: MetadataHistoryEntry): Json {
  return [entry]
}

export function appendMetadataHistoryEntry(
  existingHistory: Json | null | undefined,
  entry: MetadataHistoryEntry,
): Json {
  const history = Array.isArray(existingHistory) ? [...existingHistory] : []
  history.push(entry as Json)
  return history
}
