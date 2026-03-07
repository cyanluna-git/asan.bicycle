DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete own POI photos'
  ) THEN
    CREATE POLICY "Authenticated users can delete own POI photos"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'poi-photos'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
