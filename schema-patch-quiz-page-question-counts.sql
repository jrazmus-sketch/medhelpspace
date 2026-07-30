-- schema-patch-quiz-page-question-counts.sql
--
-- Adds `quiz_page_question_counts` — how many quiz questions each page actually
-- has, in one cheap round trip.
--
-- Why: the daily-plan engine retires a topic's quiz from the plan after a SINGLE
-- answered question. derive.ts builds `completedQuizPages` from
-- signals.quizAttempts and treats "has any attempt row" as "done", so a page
-- with 40 questions disappears from the plan the moment the student answers
-- one. To fix that, the planner needs each page's total question count to
-- compare against the student's answered count — and it needs it for many pages
-- at once, without an N+1 or pulling 5,780 quiz_questions rows into the server
-- just to length them. (Note the PostgREST 1000-row cap invariant: a bare
-- select on quiz_questions would silently truncate; an aggregate view will not.)
--
-- Shape (exactly two columns, verified against schema.sql §10):
--   page_id        bigint  — quiz_questions.page_id, FK to pages(id)
--   question_count bigint  — COUNT(*) per page
-- `quiz_questions.page_id` is declared NOT NULL, so the `WHERE page_id IS NOT
-- NULL` filter is a no-op today; it is kept as a cheap guard so the view can
-- never emit a NULL key if that constraint is ever relaxed.
--
-- Exposure — this is the first view in this schema, so spelling it out:
--   Supabase auto-grants SELECT on new public objects to anon + authenticated,
--   which would immediately publish it at /rest/v1/quiz_page_question_counts.
--   Per the default-grants invariant, we revoke that. The only reader is the
--   server's service-role client (the member content path already bypasses RLS
--   and does its gating in app code), so service_role is the only grantee.
--
--   Belt AND braces: the view is also created with `security_invoker = true`,
--   so it evaluates the underlying quiz_questions RLS as the CALLER rather than
--   as the view owner. Without it, a view owned by postgres is an RLS bypass by
--   construction — if anyone ever re-grants SELECT to authenticated (a future
--   `GRANT ... ON ALL TABLES IN SCHEMA public`, a dashboard click), the view
--   would leak per-page question counts for gated 60D content to any logged-in
--   user. With security_invoker on, that same mistake leaks nothing: an
--   authenticated caller only aggregates rows quiz_questions_read already lets
--   them see. service_role is BYPASSRLS, so the intended reader is unaffected
--   and still sees true totals across every page.
--
-- Idempotent: CREATE OR REPLACE VIEW, and REVOKE/GRANT are naturally
-- re-runnable. (CREATE OR REPLACE cannot change an existing view's column names
-- or types — if a differently-shaped `quiz_page_question_counts` somehow exists,
-- DROP it first.)
--
-- Rollback:
--   DROP VIEW IF EXISTS quiz_page_question_counts;
--
-- Run with: node scripts/run-sql.js schema-patch-quiz-page-question-counts.sql

BEGIN;

CREATE OR REPLACE VIEW quiz_page_question_counts
  WITH (security_invoker = true) AS
SELECT
  page_id,
  COUNT(*) AS question_count
FROM quiz_questions
WHERE page_id IS NOT NULL
GROUP BY page_id;

COMMENT ON VIEW quiz_page_question_counts IS
  'Per-page quiz question totals. Read by the study-plan engine (service_role) '
  'to decide when a quiz page is actually finished instead of retiring it after '
  'one answered question. security_invoker = true; service_role only.';

-- ── Grants: server-only, per the Supabase default-grants invariant ───────────

REVOKE ALL ON quiz_page_question_counts FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON quiz_page_question_counts TO service_role;

COMMIT;
