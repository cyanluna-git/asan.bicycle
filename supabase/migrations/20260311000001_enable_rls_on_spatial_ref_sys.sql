-- Migration: enable read-only RLS on PostGIS spatial_ref_sys to satisfy
-- public-schema exposure checks in Supabase security advisor.
-- This is a system metadata table used by PostGIS. We keep it readable, but
-- do not grant any write policy.

ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'spatial_ref_sys'
      AND policyname = 'spatial_ref_sys: anyone can read'
  ) THEN
    CREATE POLICY "spatial_ref_sys: anyone can read"
      ON public.spatial_ref_sys
      FOR SELECT
      USING (true);
  END IF;
END
$$;
