-- schema-patch-quiz-error-category.sql
--
-- Phase 4 — error classification. Adds a nullable `error_category` to
-- `quiz_attempts` so a student can tag WHY they missed a question, from the
-- five locked categories. Stored as an ASCII slug (accents live only in the UI
-- labels); NULL = untagged (the default — tagging is always optional).
--
--   conteudo       — didn't know the material (knowledge gap)
--   interpretacao  — misread / misinterpreted the stem
--   distracao      — knew it, slipped (careless)
--   conduta        — wrong clinical decision / reasoning
--   memorizacao    — knew the concept, forgot a specific detail
--
-- No RLS change: quiz_attempts already has own_insert / own_select / admin_select.
-- Tag writes go through the service-role client behind an app-code user_id
-- ownership guard (same pattern as the attempt insert), so no UPDATE policy is
-- added. The CHECK keeps the column self-validating for any future writer.
--
-- Idempotent (safe to re-run): ADD COLUMN IF NOT EXISTS + guarded constraint add.
--
-- Rollback:
--   ALTER TABLE quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_error_category_check;
--   ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS error_category;

BEGIN;

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS error_category text;

-- Add the CHECK once (ADD COLUMN can't carry IF NOT EXISTS + CHECK atomically on
-- re-run, so guard the constraint separately).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_error_category_check'
  ) THEN
    ALTER TABLE quiz_attempts
      ADD CONSTRAINT quiz_attempts_error_category_check
      CHECK (error_category IS NULL OR error_category IN
        ('conteudo', 'distracao', 'interpretacao', 'conduta', 'memorizacao'));
  END IF;
END $$;

-- Partial index: only tagged wrong answers are ever aggregated (error profile).
CREATE INDEX IF NOT EXISTS quiz_attempts_error_category_idx
  ON quiz_attempts (user_id, error_category)
  WHERE error_category IS NOT NULL;

COMMIT;
