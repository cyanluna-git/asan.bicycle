import type { Tables } from '@/types/database'

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
>

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
