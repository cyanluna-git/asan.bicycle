-- ============================================================================
-- Asan Bicycle App – Initial Schema
-- Migration: 20260304000002_initial_schema.sql
-- Depends on: 20260304000001_enable_postgis.sql (PostGIS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------

CREATE TYPE course_difficulty AS ENUM ('easy', 'moderate', 'hard');
CREATE TYPE poi_category AS ENUM (
  'rest_area',
  'cafe',
  'restaurant',
  'convenience_store',
  'repair_shop',
  'photo_spot',
  'parking',
  'restroom',
  'water_fountain',
  'other'
);

-- ----------------------------------------------------------------------------
-- 2. TABLES
-- ----------------------------------------------------------------------------

-- start_points: Predefined starting locations (managed via service_role only)
-- NOTE: Write access is intentionally restricted to service_role.
--       No anon/authenticated INSERT/UPDATE/DELETE policies are defined.
--       This table is seeded and managed by administrators only.
CREATE TABLE start_points (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  location    geography(Point, 4326) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- courses: User-created bicycle routes
CREATE TABLE courses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  difficulty        course_difficulty NOT NULL,
  distance_km       numeric(6,2) NOT NULL,
  elevation_gain_m  integer NOT NULL DEFAULT 0,
  est_duration_min  integer,
  start_point_id    uuid REFERENCES start_points(id),
  start_point       geography(Point, 4326),
  route             geography(LineString, 4326),
  gpx_url           text,
  theme             text,
  tags              text[] DEFAULT '{}',
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  download_count    integer NOT NULL DEFAULT 0
);

-- pois: Points of interest along a course
CREATE TABLE pois (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    poi_category NOT NULL,
  location    geography(Point, 4326) NOT NULL,
  photo_url   text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. UPDATED_AT TRIGGER FUNCTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables that have the column
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- NOTE: start_points and pois do not have updated_at columns,
-- so no trigger is needed for them.

-- ----------------------------------------------------------------------------
-- 4. INDEXES
-- ----------------------------------------------------------------------------

-- Spatial GIST indexes on geography columns
CREATE INDEX idx_start_points_location ON start_points USING GIST (location);
CREATE INDEX idx_courses_start_point   ON courses      USING GIST (start_point);
CREATE INDEX idx_courses_route         ON courses      USING GIST (route);
CREATE INDEX idx_pois_location         ON pois         USING GIST (location);

-- GIN index on tags array for containment queries (@>, &&)
CREATE INDEX idx_courses_tags ON courses USING GIN (tags);

-- B-tree indexes for common lookups / filtering
CREATE INDEX idx_courses_difficulty    ON courses (difficulty);
CREATE INDEX idx_courses_start_point_id ON courses (start_point_id);
CREATE INDEX idx_courses_created_by    ON courses (created_by);
CREATE INDEX idx_pois_course_id        ON pois (course_id);
CREATE INDEX idx_pois_category         ON pois (category);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE start_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pois         ENABLE ROW LEVEL SECURITY;

-- ---- start_points ----
-- Read-only for anonymous and authenticated users.
-- Write access is service_role only (intentional – see table comment above).
-- [Critic Note C]: No INSERT/UPDATE/DELETE policies for anon/authenticated.

CREATE POLICY "start_points: anyone can read"
  ON start_points FOR SELECT
  USING (true);

-- ---- courses ----

CREATE POLICY "courses: anyone can read"
  ON courses FOR SELECT
  USING (true);

-- [Critic Note D]: Allow INSERT when auth.uid() matches created_by OR created_by IS NULL
CREATE POLICY "courses: authenticated users can insert"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "courses: owners can update"
  ON courses FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "courses: owners can delete"
  ON courses FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- ---- pois ----

CREATE POLICY "pois: anyone can read"
  ON pois FOR SELECT
  USING (true);

-- [Critic Note E]: Only allow POI insert if the user owns the parent course
CREATE POLICY "pois: course owners can insert"
  ON pois FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );

CREATE POLICY "pois: course owners can update"
  ON pois FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );

CREATE POLICY "pois: course owners can delete"
  ON pois FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_id
        AND courses.created_by = auth.uid()
    )
  );
