-- ============================================================================
-- courses.region_id – link each course to its sigungu-level region
-- Migration: 20260405000002_courses_region_id.sql
-- Depends on: 20260405000001_create_regions.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADD COLUMN + INDEX
-- ----------------------------------------------------------------------------

ALTER TABLE courses ADD COLUMN region_id uuid REFERENCES regions(id);
CREATE INDEX courses_region_id_idx ON courses (region_id);

-- ----------------------------------------------------------------------------
-- 2. RPC: point-in-polygon detection at sigungu level
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION detect_region_by_point(
  p_lng double precision,
  p_lat double precision
)
RETURNS TABLE(region_id uuid, region_name text, parent_name text)
LANGUAGE sql STABLE AS $$
  SELECT r.id, r.name, p.name
  FROM regions r
  LEFT JOIN regions p ON p.id = r.parent_id
  WHERE r.level = 'sigungu'
    AND ST_Contains(r.geom::geometry, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  LIMIT 1;
$$;

COMMENT ON FUNCTION detect_region_by_point IS
  'Given a WGS84 longitude/latitude, returns the sigungu-level region that contains it.';

-- ----------------------------------------------------------------------------
-- 3. BACKFILL existing courses using first coordinate of route_geojson
--    route_geojson is a FeatureCollection → features[0].geometry.coordinates[0] = [lng, lat]
-- ----------------------------------------------------------------------------

UPDATE courses c
SET region_id = sub.rid
FROM (
  SELECT
    c2.id,
    (SELECT r.region_id
     FROM detect_region_by_point(
       (c2.route_geojson->'features'->0->'geometry'->'coordinates'->0->>0)::double precision,
       (c2.route_geojson->'features'->0->'geometry'->'coordinates'->0->>1)::double precision
     ) r
     LIMIT 1
    ) AS rid
  FROM courses c2
  WHERE c2.route_geojson IS NOT NULL
    AND c2.region_id IS NULL
) sub
WHERE sub.rid IS NOT NULL
  AND c.id = sub.id;
