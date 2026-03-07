ALTER TABLE public.course_reviews
ADD COLUMN IF NOT EXISTS author_name TEXT,
ADD COLUMN IF NOT EXISTS author_emoji TEXT;

UPDATE public.course_reviews AS reviews
SET
  author_name = COALESCE(
    NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(SPLIT_PART(users.email, '@', 1), ''),
    '라이더'
  ),
  author_emoji = NULLIF(BTRIM(users.raw_user_meta_data ->> 'avatar_emoji'), '')
FROM auth.users AS users
WHERE reviews.user_id = users.id
  AND (
    reviews.author_name IS NULL
    OR BTRIM(reviews.author_name) = ''
    OR reviews.author_emoji IS NULL
    OR BTRIM(reviews.author_emoji) = ''
  );

CREATE OR REPLACE FUNCTION public.sync_course_review_author_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_name TEXT;
  email_prefix TEXT;
BEGIN
  profile_name := NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'full_name'), '');
  email_prefix := NULLIF(SPLIT_PART(auth.jwt() ->> 'email', '@', 1), '');

  NEW.author_name := COALESCE(profile_name, email_prefix, NEW.author_name, '라이더');
  NEW.author_emoji := COALESCE(
    NULLIF(BTRIM(auth.jwt() -> 'user_metadata' ->> 'avatar_emoji'), ''),
    NEW.author_emoji
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_course_review_author_fields ON public.course_reviews;

CREATE TRIGGER sync_course_review_author_fields
BEFORE INSERT OR UPDATE ON public.course_reviews
FOR EACH ROW
EXECUTE FUNCTION public.sync_course_review_author_fields();

CREATE OR REPLACE VIEW public.course_reviews_public
WITH (security_invoker = true)
AS
SELECT
  id,
  course_id,
  user_id,
  rating,
  content,
  ridden_at,
  perceived_difficulty,
  condition_note,
  created_at,
  updated_at,
  author_name,
  author_emoji
FROM public.course_reviews
WHERE deleted_at IS NULL;
