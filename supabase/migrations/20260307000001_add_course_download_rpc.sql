CREATE OR REPLACE FUNCTION public.increment_course_download_count(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courses
  SET download_count = download_count + 1
  WHERE id = p_course_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_course_download_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_course_download_count(uuid) TO anon, authenticated;
