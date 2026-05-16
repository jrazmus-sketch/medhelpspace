-- Lesson completion tracking — replaces localStorage to enable cross-device sync
-- Run with: node scripts/run-sql.js schema-patch-lesson-completions.sql

CREATE TABLE IF NOT EXISTS lesson_completions (
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id    BIGINT       NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  page_id      BIGINT       NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_completions_user_page_idx
  ON lesson_completions(user_id, page_id);

ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_completions_own_insert ON lesson_completions;
DROP POLICY IF EXISTS lesson_completions_own_select ON lesson_completions;
DROP POLICY IF EXISTS lesson_completions_own_delete ON lesson_completions;
DROP POLICY IF EXISTS lesson_completions_admin_select ON lesson_completions;

CREATE POLICY lesson_completions_own_insert ON lesson_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY lesson_completions_own_select ON lesson_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY lesson_completions_own_delete ON lesson_completions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY lesson_completions_admin_select ON lesson_completions
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );
