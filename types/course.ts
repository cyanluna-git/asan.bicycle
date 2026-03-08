import type { Json, Tables } from '@/types/database'

export type CourseListItem = Pick<
  Tables<'courses'>,
  | 'id'
  | 'title'
  | 'difficulty'
  | 'distance_km'
  | 'elevation_gain_m'
  | 'theme'
  | 'tags'
  | 'uploader_name'
  | 'created_by'
> & {
  uploader_emoji?: string | null
}

export type CourseDetail = Pick<
  Tables<'courses'>,
  | 'id'
  | 'title'
  | 'description'
  | 'difficulty'
  | 'distance_km'
  | 'elevation_gain_m'
  | 'gpx_url'
  | 'theme'
  | 'tags'
  | 'uploader_name'
  | 'created_by'
  | 'start_point_id'
> & {
  uploader_emoji?: string | null
  route_geojson?: RouteGeoJSON | null
  uphill_segments?: UphillSegment[]
}

// ---------------------------------------------------------------------------
// Elevation / Uphill types
// ---------------------------------------------------------------------------

export type ElevationPoint = {
  distanceKm: number
  elevationM: number
}

export type UphillSegment = {
  id: string
  course_id: string
  name: string | null
  start_km: number
  end_km: number
  created_at: string
}

// ---------------------------------------------------------------------------
// GeoJSON types for route rendering
// ---------------------------------------------------------------------------

export type RouteFeature = {
  type: 'Feature'
  properties?: Record<string, unknown>
  geometry: {
    type: 'LineString'
    coordinates: Array<[number, number] | [number, number, number]> // [lng, lat] or [lng, lat, ele]
  }
}

export type RouteGeoJSON = {
  type: 'FeatureCollection'
  features: RouteFeature[]
}

/** Lightweight type for passing route data to the map component. */
export type CourseMapItem = {
  id: string
  route_geojson: RouteGeoJSON | null
}

/** POI item for map display (lat/lng already extracted via pois_with_coords view). */
export type PoiMapItem = {
  id: string
  course_id: string
  name: string
  category: string | null
  description: string | null
  photo_url: string | null
  lat: number
  lng: number
}

export type CourseReview = {
  id: string
  course_id: string
  user_id: string
  rating: number
  content: string
  ridden_at: string | null
  perceived_difficulty: 'easy' | 'moderate' | 'hard' | null
  condition_note: string | null
  created_at: string
  updated_at: string
  author_name: string | null
  author_emoji: string | null
}

export type CourseReviewStats = {
  review_count: number
  avg_rating: number | null
}

export type CourseAlbumPhoto = {
  id: string
  course_id: string
  user_id: string
  storage_path: string
  public_url: string
  taken_at: string | null
  caption: string | null
  width: number | null
  height: number | null
  source_exif_json: Json | null
  created_at: string
  updated_at: string
  lat: number | null
  lng: number | null
}
