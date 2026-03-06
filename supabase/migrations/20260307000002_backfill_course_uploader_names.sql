UPDATE public.courses AS courses
SET uploader_name = COALESCE(
  NULLIF(BTRIM(users.raw_user_meta_data ->> 'full_name'), ''),
  NULLIF(SPLIT_PART(COALESCE(users.email, ''), '@', 1), ''),
  '익명'
)
FROM auth.users AS users
WHERE courses.created_by = users.id
  AND courses.uploader_name IS NULL;
