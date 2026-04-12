-- Drop preview_image_url column
ALTER TABLE public.courses
  DROP COLUMN IF EXISTS preview_image_url;

-- Drop storage policy
DROP POLICY IF EXISTS "course_previews_select" ON storage.objects;

-- Note: bucket and files deleted via Storage API (not SQL-accessible)

