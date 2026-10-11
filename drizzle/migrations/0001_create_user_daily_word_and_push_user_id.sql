CREATE TABLE IF NOT EXISTS public.user_daily_word (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_date DATE NOT NULL,
  word_id UUID NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_date)
);

ALTER TABLE public.user_daily_word ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own daily word" ON public.user_daily_word;
CREATE POLICY "Users can read own daily word"
  ON public.user_daily_word FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.user_daily_word TO authenticated;
GRANT ALL ON public.user_daily_word TO service_role;

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);