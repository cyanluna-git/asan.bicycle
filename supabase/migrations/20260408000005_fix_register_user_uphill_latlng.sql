-- supabase/migrations/20260408000005_fix_register_user_uphill_latlng.sql
-- Also set start_latlng / end_latlng so chart position computation works.

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
  v_id        UUID;
  v_parts     TEXT[] := ARRAY[]::TEXT[];
  v_coord     JSONB;
  v_last_idx  INT;
  v_start_pt  TEXT;
  v_end_pt    TEXT;
BEGIN
  FOR v_coord IN SELECT * FROM jsonb_array_elements(p_coords)
  LOOP
    v_parts := v_parts || ((v_coord->0)::TEXT || ' ' || (v_coord->1)::TEXT);
  END LOOP;

  IF array_length(v_parts, 1) < 2 THEN
    RAISE EXCEPTION 'register_user_uphill: need at least 2 coordinate pairs, got %', array_length(v_parts, 1);
  END IF;

  v_last_idx := jsonb_array_length(p_coords) - 1;
  v_start_pt := 'POINT(' || (p_coords->0->0)::TEXT || ' ' || (p_coords->0->1)::TEXT || ')';
  v_end_pt   := 'POINT(' || (p_coords->v_last_idx->0)::TEXT || ' ' || (p_coords->v_last_idx->1)::TEXT || ')';

  INSERT INTO famous_uphills (
    name, distance_m, elevation_gain_m, avg_grade, max_grade,
    route, start_latlng, end_latlng
  )
  VALUES (
    p_name,
    p_distance_m,
    p_elevation_gain_m,
    p_avg_grade,
    p_max_grade,
    ST_GeogFromText('LINESTRING(' || array_to_string(v_parts, ', ') || ')'),
    ST_GeogFromText(v_start_pt),
    ST_GeogFromText(v_end_pt)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
