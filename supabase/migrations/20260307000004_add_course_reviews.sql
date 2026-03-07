CREATE TABLE IF NOT EXISTS public.admin_users (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_users (email)
VALUES ('pjy8412@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.course_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL,
  ridden_at date,
  perceived_difficulty public.course_difficulty,
  condition_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.course_reviews ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_course_reviews_updated_at
  BEFORE UPDATE ON public.course_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_course_reviews_course_id
  ON public.course_reviews (course_id);

CREATE INDEX idx_course_reviews_user_id
  ON public.course_reviews (user_id);

CREATE INDEX idx_course_reviews_active_course_created_at
  ON public.course_reviews (course_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_course_reviews_unique_active_owner
  ON public.course_reviews (course_id, user_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.is_review_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

CREATE OR REPLACE FUNCTION public.has_profile_name()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    BTRIM(
      COALESCE(auth.jwt() -> 'user_metadata' ->> 'full_name', '')
    ),
    ''
  ) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.enforce_course_review_admin_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.is_review_admin() AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Admins may only soft delete active reviews.';
    END IF;

    IF NEW.course_id IS DISTINCT FROM OLD.course_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.rating IS DISTINCT FROM OLD.rating
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.ridden_at IS DISTINCT FROM OLD.ridden_at
      OR NEW.perceived_difficulty IS DISTINCT FROM OLD.perceived_difficulty
      OR NEW.condition_note IS DISTINCT FROM OLD.condition_note
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Admins may only soft delete reviews.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_course_reviews_admin_scope
  BEFORE UPDATE ON public.course_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_course_review_admin_update();

CREATE POLICY "course_reviews: public can read active reviews"
  ON public.course_reviews FOR SELECT
  USING (deleted_at IS NULL OR public.is_review_admin());

CREATE POLICY "course_reviews: authenticated users can insert own active review"
  ON public.course_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND deleted_at IS NULL
    AND public.has_profile_name()
  );

CREATE POLICY "course_reviews: owners can update own review"
  ON public.course_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_profile_name()
  );

CREATE POLICY "course_reviews: admins can soft delete any review"
  ON public.course_reviews FOR UPDATE
  TO authenticated
  USING (public.is_review_admin())
  WITH CHECK (public.is_review_admin());

CREATE VIEW public.course_reviews_public
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
  updated_at
FROM public.course_reviews
WHERE deleted_at IS NULL;

CREATE VIEW public.course_review_stats
WITH (security_invoker = true)
AS
SELECT
  course_id,
  COUNT(*)::bigint AS review_count,
  ROUND(AVG(rating)::numeric, 1) AS avg_rating
FROM public.course_reviews
WHERE deleted_at IS NULL
GROUP BY course_id;
