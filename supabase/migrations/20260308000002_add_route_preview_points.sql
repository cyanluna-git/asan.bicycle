-- Migration: Add route_preview_points JSONB column to courses table.
-- Stores pre-computed lightweight [{lat, lng}, ...] arrays so the browse
-- page no longer needs to fetch the full route_geojson payload.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS route_preview_points JSONB;

COMMENT ON COLUMN courses.route_preview_points IS
  'Pre-computed route preview points array [{lat, lng}, ...] for lightweight browse-card rendering. Built from route_geojson via buildRoutePreview().';

-- Backfill existing courses: extract up to 48 evenly-sampled points from
-- the first LineString feature inside route_geojson.
-- This mirrors the TypeScript buildRoutePreview() logic.
UPDATE courses
SET route_preview_points = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'lat', (pt->>1)::double precision,
      'lng', (pt->>0)::double precision
    )
  )
  FROM (
    SELECT pt, row_number() OVER () AS rn, count(*) OVER () AS total
    FROM (
      SELECT jsonb_array_elements(
        route_geojson->'features'->0->'geometry'->'coordinates'
      ) AS pt
    ) raw_pts
  ) numbered
  WHERE total <= 48
     OR rn = 1
     OR rn = total
     OR (rn - 1) % greatest(((total - 1) / 47)::int, 1) = 0
)
WHERE route_geojson IS NOT NULL
  AND route_preview_points IS NULL;
