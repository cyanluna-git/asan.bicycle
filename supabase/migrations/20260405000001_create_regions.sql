-- ============================================================================
-- Regions – Korean administrative boundary polygons (sido / sigungu)
-- Migration: 20260405000001_create_regions.sql
-- Depends on: 20260304000001_enable_postgis.sql (PostGIS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE regions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  short_name text NOT NULL,
  code       text UNIQUE NOT NULL,
  level      text NOT NULL CHECK (level IN ('sido', 'sigungu')),
  parent_id  uuid REFERENCES regions(id),
  geom       geography(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE regions IS 'Korean administrative boundaries (sido + sigungu) with WGS84 MultiPolygon geometry.';
COMMENT ON COLUMN regions.code IS 'KOSTAT code: 2-digit for sido, 5-digit for sigungu.';

-- ----------------------------------------------------------------------------
-- 2. INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX regions_geom_idx   ON regions USING GIST (geom);
CREATE INDEX regions_level_idx  ON regions (level);
CREATE INDEX regions_parent_idx ON regions (parent_id);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regions: anyone can read"
  ON regions FOR SELECT
  USING (true);
