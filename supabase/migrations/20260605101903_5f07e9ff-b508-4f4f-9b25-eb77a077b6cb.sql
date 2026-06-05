CREATE TABLE IF NOT EXISTS public.word_reviews (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id           UUID        NOT NULL REFERENCES public.words(id) ON DELETE CASCADE,
  ease_factor       FLOAT       NOT NULL DEFAULT 2.5,
  interval_days     INT         NOT NULL DEFAULT 1,
  repetitions       INT         NOT NULL DEFAULT 0,
  next_review_date  DATE        NOT NULL DEFAULT (CURRENT_DATE + 1),
  last_reviewed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_reviews TO authenticated;
GRANT ALL ON public.word_reviews TO service_role;

ALTER TABLE public.word_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own word reviews"
  ON public.word_reviews FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_word_reviews_user_date
  ON public.word_reviews(user_id, next_review_date);