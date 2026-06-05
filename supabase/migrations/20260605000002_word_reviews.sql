-- Table SRS : une ligne par (utilisateur, mot)
-- Stocke les paramètres SM-2 pour la répétition espacée
CREATE TABLE IF NOT EXISTS word_reviews (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_id           UUID        NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  ease_factor       FLOAT       NOT NULL DEFAULT 2.5,
  interval_days     INT         NOT NULL DEFAULT 1,
  repetitions       INT         NOT NULL DEFAULT 0,
  next_review_date  DATE        NOT NULL DEFAULT (CURRENT_DATE + 1),
  last_reviewed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word_id)
);

ALTER TABLE word_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own word reviews"
  ON word_reviews FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_word_reviews_user_date
  ON word_reviews(user_id, next_review_date);
