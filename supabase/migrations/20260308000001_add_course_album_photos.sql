CREATE TABLE IF NOT EXISTS public.course_album_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  location geography(Point, 4326),
  taken_at timestamptz,
  caption text,
  width integer,
  height integer,
  source_exif_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_album_photos_storage_path_not_blank
    CHECK (btrim(storage_path) <> ''),
  CONSTRAINT course_album_photos_public_url_not_blank
    CHECK (btrim(public_url) <> ''),
  CONSTRAINT course_album_photos_width_positive
    CHECK (width IS NULL OR width > 0),
  CONSTRAINT course_album_photos_height_positive
    CHECK (height IS NULL OR height > 0)
);

ALTER TABLE public.course_album_photos ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_course_album_photos_updated_at
  BEFORE UPDATE ON public.course_album_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_course_album_photos_course_created_at
  ON public.course_album_photos (course_id, created_at DESC);

CREATE INDEX idx_course_album_photos_user_created_at
  ON public.course_album_photos (user_id, created_at DESC);

CREATE INDEX idx_course_album_photos_location
  ON public.course_album_photos USING gist (location);

CREATE UNIQUE INDEX idx_course_album_photos_storage_path
  ON public.course_album_photos (storage_path);

CREATE POLICY "course_album_photos: public can read"
  ON public.course_album_photos FOR SELECT
  USING (true);

CREATE POLICY "course_album_photos: authenticated users can insert own photos"
  ON public.course_album_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_profile_name()
    AND split_part(storage_path, '/', 1) = auth.uid()::text
  );

CREATE POLICY "course_album_photos: owners can update own photos"
  ON public.course_album_photos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND split_part(storage_path, '/', 1) = auth.uid()::text
  );

CREATE POLICY "course_album_photos: owners can delete own photos"
  ON public.course_album_photos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "course_album_photos: admins can manage all photos"
  ON public.course_album_photos FOR ALL
  TO authenticated
  USING (public.is_review_admin())
  WITH CHECK (public.is_review_admin());

CREATE VIEW public.course_album_photos_with_coords
WITH (security_invoker = true)
AS
SELECT
  id,
  course_id,
  user_id,
  storage_path,
  public_url,
  taken_at,
  caption,
  width,
  height,
  source_exif_json,
  created_at,
  updated_at,
  ST_Y(location::geometry) AS lat,
  ST_X(location::geometry) AS lng
FROM public.course_album_photos;

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-album-photos', 'course-album-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload course album photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-album-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Course album photos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'course-album-photos');

CREATE POLICY "Authenticated users can update own course album photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'course-album-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'course-album-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can delete own course album photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-album-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
