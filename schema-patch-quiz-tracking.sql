-- Quiz attempt tracking + last-page tracking
-- Run with: node scripts/run-sql.js schema-patch-quiz-tracking.sql

-- ── quiz_attempts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id  BIGINT       NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  page_id      BIGINT       NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  specialty_id INT          REFERENCES specialties(id) ON DELETE SET NULL,
  is_correct   BOOLEAN      NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx
  ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_page_idx
  ON quiz_attempts(user_id, page_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_specialty_idx
  ON quiz_attempts(user_id, specialty_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_created_idx
  ON quiz_attempts(user_id, created_at DESC);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_attempts_own_insert  ON quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_own_select  ON quiz_attempts;
DROP POLICY IF EXISTS quiz_attempts_admin_select ON quiz_attempts;

CREATE POLICY quiz_attempts_own_insert ON quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY quiz_attempts_own_select ON quiz_attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY quiz_attempts_admin_select ON quiz_attempts
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'support_admin')
  );

-- ── profiles: last-page tracking ─────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_page_id BIGINT REFERENCES pages(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_page_at TIMESTAMPTZ;
