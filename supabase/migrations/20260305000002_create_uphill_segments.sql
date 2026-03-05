CREATE TABLE IF NOT EXISTS uphill_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT,
  start_km NUMERIC(6,2) NOT NULL,
  end_km NUMERIC(6,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uphill_segments_course_id_idx ON uphill_segments(course_id);

ALTER TABLE uphill_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uphill_segments are publicly readable"
  ON uphill_segments FOR SELECT TO public USING (true);

CREATE POLICY "authenticated users can insert uphill_segments"
  ON uphill_segments FOR INSERT TO authenticated WITH CHECK (true);
