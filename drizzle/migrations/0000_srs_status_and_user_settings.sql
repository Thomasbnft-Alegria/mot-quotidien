CREATE TABLE IF NOT EXISTS public.word_reviews_backup_20261011 AS SELECT * FROM public.word_reviews;
CREATE TABLE IF NOT EXISTS public.user_progress_backup_20261011 AS SELECT * FROM public.user_progress;
ALTER TABLE public.word_reviews_backup_20261011 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress_backup_20261011 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.word_reviews
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS easy_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mastered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_stage SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_check_date DATE;

ALTER TABLE public.word_reviews
  DROP CONSTRAINT IF EXISTS word_reviews_status_check,
  ADD CONSTRAINT word_reviews_status_check CHECK (status IN ('new','active','mastered','ignored')),
  DROP CONSTRAINT IF EXISTS word_reviews_check_stage_check,
  ADD CONSTRAINT word_reviews_check_stage_check CHECK (check_stage BETWEEN 0 AND 2),
  DROP CONSTRAINT IF EXISTS word_reviews_easy_count_check,
  ADD CONSTRAINT word_reviews_easy_count_check CHECK (easy_count >= 0);

CREATE INDEX IF NOT EXISTS idx_word_reviews_user_status
  ON public.word_reviews(user_id, status);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reservoir_size INTEGER NOT NULL DEFAULT 20 CHECK (reservoir_size BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;
CREATE POLICY "Users can manage own settings"
  ON public.user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();