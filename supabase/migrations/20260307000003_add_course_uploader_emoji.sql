ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS uploader_emoji text;

WITH emoji_pool AS (
  SELECT ARRAY[
    '🚴','🚵','🦊','🐯','🐻','🐱','🐶','🦉','🐼','🐸',
    '🦄','🐙','☕','🍜','🍊','🌿','🌊','⛰️','⭐','🔥'
  ]::text[] AS values
)
UPDATE public.courses AS courses
SET uploader_emoji = COALESCE(
  NULLIF(users.raw_user_meta_data ->> 'avatar_emoji', ''),
  (
    SELECT values[
      1 + (
        ABS((('x' || SUBSTRING(MD5(COALESCE(users.id::text, courses.id::text)), 1, 8))::bit(32)::int))
        % array_length(values, 1)
      )
    ]
    FROM emoji_pool
  )
)
FROM auth.users AS users
WHERE courses.created_by = users.id
  AND courses.uploader_emoji IS NULL;
