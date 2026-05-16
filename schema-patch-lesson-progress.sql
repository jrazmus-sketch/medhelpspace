-- Audio playback position persistence — cross-device resume
-- Run with: node scripts/run-sql.js schema-patch-lesson-progress.sql

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id        BIGINT       NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  position_seconds INT          NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS lesson_progress_user_idx ON lesson_progress(user_id);

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_progress_own_all ON lesson_progress;
DROP POLICY IF EXISTS lesson_progress_admin_select ON lesson_progress;

CREATE POLICY lesson_progress_own_all ON lesson_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY lesson_progress_admin_select ON lesson_progress
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );
