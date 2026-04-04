PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS import_batch (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  source            TEXT NOT NULL DEFAULT 'ridingazua',
  output_dir        TEXT NOT NULL,
  manifest_path     TEXT NOT NULL,
  summary_path      TEXT,
  started_at        TEXT,
  finished_at       TEXT,
  total_courses     INTEGER,
  processed         INTEGER,
  downloaded        INTEGER,
  failed            INTEGER,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_course (
  course_id           INTEGER PRIMARY KEY,
  source              TEXT NOT NULL DEFAULT 'ridingazua',
  source_url          TEXT NOT NULL,
  slug                TEXT,
  title               TEXT,
  title_normalized    TEXT,
  visibility          TEXT NOT NULL DEFAULT 'public',
  download_status     TEXT NOT NULL,
  gpx_path            TEXT NOT NULL,
  file_size_bytes     INTEGER,
  downloaded_at       TEXT,
  import_batch_id     INTEGER REFERENCES import_batch(id) ON DELETE SET NULL,
  source_manifest_json TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_geometry (
  course_id         INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  parse_status      TEXT NOT NULL DEFAULT 'pending',
  parse_error       TEXT,
  point_count       INTEGER,
  waypoint_count    INTEGER,
  start_lat         REAL,
  start_lng         REAL,
  end_lat           REAL,
  end_lng           REAL,
  start_ele_m       REAL,
  end_ele_m         REAL,
  bbox_min_lat      REAL,
  bbox_min_lng      REAL,
  bbox_max_lat      REAL,
  bbox_max_lng      REAL,
  distance_km       REAL,
  elevation_gain_m  REAL,
  route_hash        TEXT,
  parsed_at         TEXT
);

CREATE TABLE IF NOT EXISTS admin_area_match (
  course_id         INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  country_code      TEXT,
  country_name      TEXT,
  is_korea          INTEGER,
  sido_code         TEXT,
  sido_name         TEXT,
  sigungu_code      TEXT,
  sigungu_name      TEXT,
  match_method      TEXT,
  match_confidence  REAL,
  matched_at        TEXT,
  raw_response_json TEXT
);

CREATE TABLE IF NOT EXISTS route_fingerprint (
  course_id                 INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  start_grid                TEXT,
  end_grid                  TEXT,
  bbox_hash                 TEXT,
  simplified_polyline_hash  TEXT,
  sampled_points_json       TEXT,
  metrics_json              TEXT,
  created_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS route_candidate_bucket (
  course_id      INTEGER NOT NULL REFERENCES raw_course(course_id) ON DELETE CASCADE,
  bucket_key     TEXT NOT NULL,
  bucket_type    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, bucket_key)
);

CREATE TABLE IF NOT EXISTS route_surface_profile (
  course_id               INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  sample_point_count      INTEGER NOT NULL DEFAULT 0,
  matched_point_count     INTEGER NOT NULL DEFAULT 0,
  nearest_threshold_m     REAL,
  paved_share             REAL,
  cycleway_share          REAL,
  gravel_share            REAL,
  trail_share             REAL,
  hiking_risk_share       REAL,
  dominant_surface_label  TEXT,
  confidence              REAL,
  flags_json              TEXT,
  raw_summary_json        TEXT,
  source                  TEXT NOT NULL DEFAULT 'osm_overpass',
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS similar_course_edge (
  course_id_a        INTEGER NOT NULL REFERENCES raw_course(course_id) ON DELETE CASCADE,
  course_id_b        INTEGER NOT NULL REFERENCES raw_course(course_id) ON DELETE CASCADE,
  candidate_bucket   TEXT,
  similarity_score   REAL,
  start_distance_m   REAL,
  same_sigungu       INTEGER,
  decision_hint      TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id_a, course_id_b),
  CHECK (course_id_a < course_id_b)
);

CREATE TABLE IF NOT EXISTS similar_course_group (
  group_id             INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_course_id  INTEGER REFERENCES raw_course(course_id) ON DELETE SET NULL,
  region_scope         TEXT,
  country_code         TEXT,
  sigungu_code         TEXT,
  status               TEXT NOT NULL DEFAULT 'auto',
  member_count         INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_member (
  group_id    INTEGER NOT NULL REFERENCES similar_course_group(group_id) ON DELETE CASCADE,
  course_id   INTEGER NOT NULL REFERENCES raw_course(course_id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (group_id, course_id)
);

CREATE TABLE IF NOT EXISTS curation_decision (
  course_id            INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  decision             TEXT NOT NULL DEFAULT 'pending',
  canonical_course_id  INTEGER REFERENCES raw_course(course_id) ON DELETE SET NULL,
  merge_group_id       INTEGER REFERENCES similar_course_group(group_id) ON DELETE SET NULL,
  route_scope_label    TEXT,
  route_scope_basis    TEXT,
  ride_style_label     TEXT,
  ride_style_basis     TEXT,
  export_approved      INTEGER NOT NULL DEFAULT 0,
  export_basis         TEXT,
  override_title       TEXT,
  variant_label        TEXT,
  variant_kind         TEXT,
  reviewer             TEXT,
  reason_code          TEXT,
  reason_note          TEXT,
  reviewed_at          TEXT,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supabase_export_queue (
  course_id               INTEGER PRIMARY KEY REFERENCES raw_course(course_id) ON DELETE CASCADE,
  canonical_course_id     INTEGER REFERENCES raw_course(course_id) ON DELETE SET NULL,
  export_status           TEXT NOT NULL DEFAULT 'pending',
  target_start_point_name TEXT,
  target_region_scope     TEXT,
  override_title          TEXT,
  override_theme          TEXT,
  override_tags_json      TEXT,
  export_payload_json     TEXT,
  queued_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exported_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_raw_course_download_status ON raw_course(download_status);
CREATE INDEX IF NOT EXISTS idx_raw_course_import_batch_id ON raw_course(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_course_geometry_parse_status ON course_geometry(parse_status);
CREATE INDEX IF NOT EXISTS idx_admin_area_match_sigungu_code ON admin_area_match(sigungu_code);
CREATE INDEX IF NOT EXISTS idx_route_fingerprint_start_grid ON route_fingerprint(start_grid);
CREATE INDEX IF NOT EXISTS idx_route_fingerprint_end_grid ON route_fingerprint(end_grid);
CREATE INDEX IF NOT EXISTS idx_route_candidate_bucket_key ON route_candidate_bucket(bucket_key);
CREATE INDEX IF NOT EXISTS idx_route_candidate_bucket_type ON route_candidate_bucket(bucket_type);
CREATE INDEX IF NOT EXISTS idx_route_surface_profile_label ON route_surface_profile(dominant_surface_label);
CREATE INDEX IF NOT EXISTS idx_similar_course_edge_bucket ON similar_course_edge(candidate_bucket);
CREATE INDEX IF NOT EXISTS idx_group_member_course_id ON group_member(course_id);
CREATE INDEX IF NOT EXISTS idx_curation_decision_decision ON curation_decision(decision);
CREATE INDEX IF NOT EXISTS idx_supabase_export_queue_status ON supabase_export_queue(export_status);
