-- supabase/migrations/20260407000001_create_famous_uphills.sql
-- Depends on: 20260304000001_enable_postgis.sql (PostGIS)
--             20260304000002_initial_schema.sql  (courses table)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. famous_uphills — Strava-sourced named uphill segments for Korea
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS famous_uphills (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  strava_segment_id  BIGINT       UNIQUE,                           -- nullable: allows hand-curated rows
  name               TEXT         NOT NULL,
  distance_m         NUMERIC(8,1),
  avg_grade          NUMERIC(4,2),                                  -- % (e.g. 8.5 = 8.5%)
  max_grade          NUMERIC(4,2),
  elevation_gain_m   NUMERIC(7,1),
  climb_category     SMALLINT     CHECK (climb_category BETWEEN 0 AND 5),
  start_latlng       geography(Point, 4326),
  end_latlng         geography(Point, 4326),
  route              geography(LineString, 4326),                   -- primary matching geometry
  raw_strava         JSONB,                                         -- original API response
  created_at         TIMESTAMPTZ  DEFAULT NOW()
);

-- Spatial indexes
CREATE INDEX IF NOT EXISTS famous_uphills_route_gist
  ON famous_uphills USING GIST (route);

CREATE INDEX IF NOT EXISTS famous_uphills_start_latlng_gist
  ON famous_uphills USING GIST (start_latlng);

-- RLS
ALTER TABLE famous_uphills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "famous_uphills are publicly readable"
  ON famous_uphills FOR SELECT TO public USING (true);
-- INSERT/UPDATE/DELETE: service role only (no explicit policy needed — service role bypasses RLS)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. course_uphills — junction: which famous uphills a course passes through
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_uphills (
  course_id          UUID         NOT NULL REFERENCES courses(id)       ON DELETE CASCADE,
  famous_uphill_id   UUID         NOT NULL REFERENCES famous_uphills(id) ON DELETE CASCADE,
  matched_at         TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (course_id, famous_uphill_id)
);

CREATE INDEX IF NOT EXISTS course_uphills_course_id_idx
  ON course_uphills (course_id);

CREATE INDEX IF NOT EXISTS course_uphills_famous_uphill_id_idx
  ON course_uphills (famous_uphill_id);

ALTER TABLE course_uphills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_uphills are publicly readable"
  ON course_uphills FOR SELECT TO public USING (true);
