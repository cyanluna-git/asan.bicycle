ALTER TABLE courses
ADD COLUMN IF NOT EXISTS uploader_name text;

ALTER TABLE courses
ADD COLUMN IF NOT EXISTS metadata_history jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('poi-photos', 'poi-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload POI photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'poi-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "POI photos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'poi-photos');
