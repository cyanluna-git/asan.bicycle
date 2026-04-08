-- Source URL for courses imported from external services (e.g. ridingazua.cc)
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN courses.source_url IS
  'Original source URL for imported courses (e.g. https://ridingazua.cc/c/1234)';
