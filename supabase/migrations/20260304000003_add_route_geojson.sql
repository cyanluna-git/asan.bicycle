-- Migration: Add route_geojson JSONB column to courses table
-- This column stores pre-computed GeoJSON for client-side map rendering.
-- The existing PostGIS `route` column is kept for spatial queries.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS route_geojson JSONB;

-- Validate that stored GeoJSON is a FeatureCollection at the top level
ALTER TABLE courses
  ADD CONSTRAINT courses_route_geojson_type_check
  CHECK (route_geojson IS NULL OR route_geojson->>'type' = 'FeatureCollection');

COMMENT ON COLUMN courses.route_geojson IS
  'GeoJSON FeatureCollection with LineString features for map rendering. Schema: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[lng, lat], ...] } }] }';

-- Sample data: Asan-to-Gongju approximate route for development/testing.
-- Uncomment and run manually if you need seed data:
--
-- UPDATE courses
-- SET route_geojson = '{
--   "type": "FeatureCollection",
--   "features": [{
--     "type": "Feature",
--     "properties": {},
--     "geometry": {
--       "type": "LineString",
--       "coordinates": [
--         [127.004, 36.7797],
--         [126.99, 36.80],
--         [126.98, 36.81],
--         [126.96, 36.85],
--         [126.93, 36.88],
--         [126.90, 36.92],
--         [126.88, 36.95],
--         [126.87, 36.96],
--         [126.86, 36.98],
--         [126.85, 37.00],
--         [126.83, 37.02],
--         [126.82, 37.04]
--       ]
--     }
--   }]
-- }'::jsonb
-- WHERE id = (SELECT id FROM courses ORDER BY created_at LIMIT 1);
