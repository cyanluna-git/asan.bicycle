-- View: pois_with_coords
-- Extracts lat/lng from PostGIS geography so the JS client can read them directly.
-- security_invoker ensures callers are subject to pois RLS (anyone can read).

CREATE VIEW pois_with_coords WITH (security_invoker = true) AS
SELECT
  id,
  course_id,
  name,
  category,
  description,
  photo_url,
  created_at,
  ST_Y(location::geometry) AS lat,
  ST_X(location::geometry) AS lng
FROM pois;
