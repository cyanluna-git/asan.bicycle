-- Add preview_image_url column to courses table
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS preview_image_url text;

-- Create storage bucket for course preview images
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-previews', 'course-previews', true)
ON CONFLICT DO NOTHING;

-- Public read only — service role (used server-side) bypasses RLS for writes
CREATE POLICY "course_previews_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'course-previews');
