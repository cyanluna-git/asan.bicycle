import type { Tables } from '@/types/database'

export type CourseListItem = Pick<
  Tables<'courses'>,
  'id' | 'title' | 'difficulty' | 'distance_km' | 'elevation_gain_m' | 'theme' | 'tags'
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
>

// ---------------------------------------------------------------------------
// GeoJSON types for route rendering
// ---------------------------------------------------------------------------

export type RouteFeature = {
  type: 'Feature'
  properties?: Record<string, unknown>
  geometry: {
    type: 'LineString'
    coordinates: Array<[number, number]> // [lng, lat]
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
  category: import('@/types/database').Enums<'poi_category'>
  description: string | null
  lat: number
  lng: number
}
