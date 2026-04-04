-- user_profiles: per-user display settings + home region link
CREATE TABLE user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  emoji           text NOT NULL DEFAULT '🚴',
  home_region_id  uuid REFERENCES regions(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_profiles_home_region_idx ON user_profiles(home_region_id);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles: users can read own"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "user_profiles: users can write own"
  ON user_profiles FOR ALL
  USING (auth.uid() = id);

-- Reuse existing set_updated_at() from 20260304000002_initial_schema.sql
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
