-- Enable PostGIS extensions for spatial data support
-- Required for GEOGRAPHY columns (Point, LineString) used in start_points, courses, pois

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
