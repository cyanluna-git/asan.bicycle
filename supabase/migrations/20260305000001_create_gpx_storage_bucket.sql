-- Create GPX storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('gpx-files', 'gpx-files', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload their own files
CREATE POLICY "Authenticated users can upload GPX files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'gpx-files');

-- RLS: anyone can read GPX files (for public course downloads)
CREATE POLICY "GPX files are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'gpx-files');
