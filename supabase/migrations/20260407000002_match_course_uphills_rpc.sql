-- supabase/migrations/20260407000002_match_course_uphills_rpc.sql
-- Depends on: 20260407000001_create_famous_uphills.sql

CREATE OR REPLACE FUNCTION match_course_uphills(p_course_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_route  geography(LineString, 4326);
  v_count  integer := 0;
BEGIN
  -- 1. Get or derive course route geography
  SELECT route INTO v_route
  FROM courses
  WHERE id = p_course_id;

  -- If route is NULL, try to derive from route_geojson (FeatureCollection with possible 3D coords)
  IF v_route IS NULL THEN
    SELECT
      ST_Force2D(
        ST_GeomFromGeoJSON(route_geojson->'features'->0->'geometry')
      )::geography(LineString, 4326)
    INTO v_route
    FROM courses
    WHERE id = p_course_id
      AND route_geojson IS NOT NULL
      AND jsonb_array_length(route_geojson->'features') > 0;

    -- Backfill courses.route for future queries
    IF v_route IS NOT NULL THEN
      UPDATE courses SET route = v_route WHERE id = p_course_id;
    END IF;
  END IF;

  -- No route available: return 0 (best-effort)
  IF v_route IS NULL THEN
    RETURN 0;
  END IF;

  -- 2. Delete existing matches
  DELETE FROM course_uphills WHERE course_id = p_course_id;

  -- 3. Insert new matches: famous_uphills whose route is within 100m of course route
  INSERT INTO course_uphills (course_id, famous_uphill_id)
  SELECT p_course_id, fu.id
  FROM famous_uphills fu
  WHERE ST_DWithin(fu.route, v_route, 100);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION match_course_uphills(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION match_course_uphills IS
  'Matches a course against famous_uphills within 100m using PostGIS ST_DWithin. '
  'Lazily backfills courses.route from route_geojson if NULL. Returns match count.';
