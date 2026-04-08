-- Surface type for courses: road / gravel / mtb
-- road  = 포장도로 전용 로드 코스
-- gravel = 그래블 (비포장 혼합)
-- mtb   = 임도·산악 코스

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS surface_type text
    CHECK (surface_type IN ('road', 'gravel', 'mtb'));

COMMENT ON COLUMN courses.surface_type IS
  'road | gravel | mtb — null means unclassified (treated as road in UI)';
