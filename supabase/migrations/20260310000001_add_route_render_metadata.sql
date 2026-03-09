-- Migration: Add persisted route render metadata for faster explore/detail rendering.
-- Stores neutral, reusable derived payloads so bounds fitting, hover sync,
-- elevation charts, and slope summaries can avoid traversing raw route_geojson
-- on every client render.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS route_render_metadata JSONB;

COMMENT ON COLUMN courses.route_render_metadata IS
  'Persisted neutral render metadata JSON for route bounds, hover profile, and slope distance segments. Built from route_geojson via buildRouteRenderMetadata().';

-- Backfill path:
-- Existing rows should be populated with scripts/backfill-route-render-metadata.mjs
-- after this migration is applied. Keeping the heavy derivation in the app layer
-- avoids duplicating complex route traversal logic in SQL and matches upload-time
-- generation exactly.
