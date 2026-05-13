-- flashcard_attempts: per-user flashcard performance tracking
-- Run with: node scripts/run-sql.js schema-patch-flashcard-attempts.sql

CREATE TABLE IF NOT EXISTS flashcard_attempts (
  id                bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_item_id bigint       NOT NULL REFERENCES flashcard_items(id) ON DELETE CASCADE,
  attempted_at      timestamptz  NOT NULL DEFAULT now(),
  result            text         NOT NULL CHECK (result IN ('correct', 'incorrect')),
  session_id        uuid         NOT NULL
);

CREATE INDEX IF NOT EXISTS flashcard_attempts_user_session_idx
  ON flashcard_attempts(user_id, session_id);

CREATE INDEX IF NOT EXISTS flashcard_attempts_item_idx
  ON flashcard_attempts(flashcard_item_id);

ALTER TABLE flashcard_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own attempts"
  ON flashcard_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attempts"
  ON flashcard_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
