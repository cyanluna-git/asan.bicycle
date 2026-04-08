-- Add pre-computed chart positions to course_uphills.
-- chart_start_km / chart_end_km store the km range on the course elevation chart
-- where this uphill appears IN THE ASCENDING DIRECTION.
-- NULL means the uphill was matched geographically but the course traverses it
-- in the downhill direction (or the endpoint could not be located on the route).

ALTER TABLE course_uphills
  ADD COLUMN IF NOT EXISTS chart_start_km FLOAT,
  ADD COLUMN IF NOT EXISTS chart_end_km   FLOAT;

COMMENT ON COLUMN course_uphills.chart_start_km IS
  'Distance (km) on the course route where this uphill starts (ascending direction). NULL if not ascending.';
COMMENT ON COLUMN course_uphills.chart_end_km IS
  'Distance (km) on the course route where this uphill ends (summit). NULL if not ascending.';
