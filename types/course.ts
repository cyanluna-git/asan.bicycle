import type { Tables } from '@/types/database'

export type CourseListItem = Pick<
  Tables<'courses'>,
  'id' | 'title' | 'difficulty' | 'distance_km' | 'elevation_gain_m' | 'theme' | 'tags'
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
