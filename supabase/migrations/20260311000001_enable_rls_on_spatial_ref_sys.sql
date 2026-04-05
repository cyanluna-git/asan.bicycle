-- Migration: enable read-only RLS on PostGIS spatial_ref_sys to satisfy
-- public-schema exposure checks in Supabase security advisor.
-- This is a system metadata table used by PostGIS. We keep it readable, but
-- do not grant any write policy.
-- NOTE: ALTER TABLE is wrapped in exception handler because spatial_ref_sys
-- is owned by supabase_admin and the postgres role cannot enable RLS on it.

DO $$
BEGIN
  BEGIN
    ALTER TABLE IF EXISTS public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping RLS on spatial_ref_sys: insufficient privilege (expected)';
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'spatial_ref_sys'
      AND policyname = 'spatial_ref_sys: anyone can read'
  ) THEN
    BEGIN
      CREATE POLICY "spatial_ref_sys: anyone can read"
        ON public.spatial_ref_sys
        FOR SELECT
        USING (true);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping policy on spatial_ref_sys: insufficient privilege (expected)';
    END;
  END IF;
END
$$;
