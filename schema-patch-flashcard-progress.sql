-- Flashcard SM-2 spaced repetition progress
-- Run with: node scripts/run-sql.js schema-patch-flashcard-progress.sql

CREATE TABLE IF NOT EXISTS flashcard_progress (
  user_id           UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flashcard_item_id BIGINT       NOT NULL REFERENCES flashcard_items(id) ON DELETE CASCADE,
  ease_factor       NUMERIC(4,2) NOT NULL DEFAULT 2.5,
  interval_days     INT          NOT NULL DEFAULT 1,
  repetitions       INT          NOT NULL DEFAULT 0,
  due_date          DATE         NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, flashcard_item_id)
);

CREATE INDEX IF NOT EXISTS flashcard_progress_user_due_idx
  ON flashcard_progress(user_id, due_date);

ALTER TABLE flashcard_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flashcard_progress_own_all ON flashcard_progress;
DROP POLICY IF EXISTS flashcard_progress_admin_select ON flashcard_progress;

CREATE POLICY flashcard_progress_own_all ON flashcard_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY flashcard_progress_admin_select ON flashcard_progress
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );
