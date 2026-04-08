-- supabase/migrations/20260408000004_register_user_uphill_rpc.sql
-- Allows server-side code to insert a user-discovered uphill into famous_uphills
-- by passing coordinates as a JSON array of [lng, lat] pairs.
-- SECURITY DEFINER runs as table owner, bypassing RLS (service role already bypasses RLS,
-- but this makes the function callable from anon context too if needed).

CREATE OR REPLACE FUNCTION register_user_uphill(
  p_name            TEXT,
  p_distance_m      NUMERIC,
  p_elevation_gain_m NUMERIC,
  p_avg_grade       NUMERIC,
  p_max_grade       NUMERIC,
  p_coords          JSONB          -- [[lng, lat], [lng, lat], ...]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id    UUID;
  v_parts TEXT[] := ARRAY[]::TEXT[];
  v_coord JSONB;
BEGIN
  FOR v_coord IN SELECT * FROM jsonb_array_elements(p_coords)
  LOOP
    v_parts := v_parts || ((v_coord->0)::TEXT || ' ' || (v_coord->1)::TEXT);
  END LOOP;

  IF array_length(v_parts, 1) < 2 THEN
    RAISE EXCEPTION 'register_user_uphill: need at least 2 coordinate pairs, got %', array_length(v_parts, 1);
  END IF;

  INSERT INTO famous_uphills (name, distance_m, elevation_gain_m, avg_grade, max_grade, route)
  VALUES (
    p_name,
    p_distance_m,
    p_elevation_gain_m,
    p_avg_grade,
    p_max_grade,
    ST_GeogFromText('LINESTRING(' || array_to_string(v_parts, ', ') || ')')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
