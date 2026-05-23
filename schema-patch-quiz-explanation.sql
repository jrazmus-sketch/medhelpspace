-- schema-patch-quiz-explanation.sql
--
-- Adds quiz_questions.explanation_html for rich per-question commentary.
--
-- Context: the *-simulados text-lesson pages (172 total) carry rich
-- per-question teaching content — "Comentário:", "PEGA REVALIDA:", and
-- "Resumo-chave:" blocks — that doesn't fit the per-option `answers[].feedback`
-- shape used by the existing H5P quizzes. This column gives each question
-- a dedicated slot for that block.
--
-- The column is nullable: existing 204 H5P quiz rows stay untouched.
-- New simulado-derived rows populate it; renderer shows it only when set.
--
-- Idempotent (safe to re-run).
--
-- Rollback:
--   ALTER TABLE quiz_questions DROP COLUMN IF EXISTS explanation_html;

BEGIN;

ALTER TABLE quiz_questions
  ADD COLUMN IF NOT EXISTS explanation_html text;

COMMENT ON COLUMN quiz_questions.explanation_html IS
  'Rich per-question commentary (Comentário/PEGA/Resumo). Null for legacy H5P quizzes that only carry per-option feedback in answers[].feedback.';

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'quiz_questions' AND column_name = 'explanation_html';

COMMIT;
