-- Close the Supabase advisor warnings emailed 28 Jun 2026:
--   * rls_disabled_in_public  ("Table publicly accessible")
--   * sensitive_columns_exposed ("Sensitive data publicly accessible")
--
-- Audited with scratch/rls-audit.js against prod. Seven public-schema tables had
-- RLS OFF *and* the default anon/authenticated grants Supabase applies to every
-- new table, so anyone with the public anon key could read them through the
-- auto-generated PostgREST API. Three of them carry user_id columns (study
-- activity) — that is the "sensitive data" warning:
--   - flashcard_attempts_backup_prekarina   (94 rows; user_id, result, session_id)
--   - quiz_attempts_bk_questoes             (60 rows; user_id, is_correct)
--   - review_schedule_fc_backup_prekarina   (36 rows; user_id, SM-2 state)
-- The other four are content snapshots (no PII):
--   - flashcard_items_backup_prekarina      (3506 rows)
--   - pages_bk_questoes                      (224 rows)
--   - nav_items_bk_questoes                  (273 rows)
--   - quiz_questions_bk_questoes             (711 rows)
--
-- All seven are one-time safety snapshots created by the Karina flashcard
-- re-import (2026-06-25, *_backup_prekarina) and the questões re-import
-- (2026-06-26, *_bk_questoes). Nothing in the app references them (verified by
-- grep over app/). They are NOT dropped here — both source migrations still have
-- OPEN reconciliation items (flashcards: "dropped high-yield topics"; questões:
-- "Karina retire list"), so these remain the pre-Karina reference snapshot until
-- that work is signed off. Once it is, drop them (see Cleanup below).
--
-- Fix = enable RLS with NO policies => deny-all to anon/authenticated, plus
-- REVOKE the default grants for defense-in-depth. service_role (BYPASSRLS) is
-- unaffected, so scripts/*.js run-sql access still works. Idempotent.
--
-- Run with: node scripts/run-sql.js schema-patch-lock-stale-backup-tables.sql

BEGIN;

DO $$
DECLARE
  t text;
  backups text[] := ARRAY[
    'flashcard_attempts_backup_prekarina',
    'flashcard_items_backup_prekarina',
    'nav_items_bk_questoes',
    'pages_bk_questoes',
    'quiz_attempts_bk_questoes',
    'quiz_questions_bk_questoes',
    'review_schedule_fc_backup_prekarina'
  ];
BEGIN
  FOREACH t IN ARRAY backups LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ── Verify (run manually after) ──────────────────────────────────────────────
-- node scratch/rls-audit.js   -> should report "No tables are both RLS-off AND
--                                 granted to anon/authenticated."
--
-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Per table: ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;
--            GRANT ALL ON public.<t> TO anon, authenticated;  -- (not advised)
--
-- ── Cleanup (do this instead, once Karina reconciliation is signed off) ───────
-- DROP TABLE IF EXISTS flashcard_attempts_backup_prekarina;
-- DROP TABLE IF EXISTS flashcard_items_backup_prekarina;
-- DROP TABLE IF EXISTS nav_items_bk_questoes;
-- DROP TABLE IF EXISTS pages_bk_questoes;
-- DROP TABLE IF EXISTS quiz_attempts_bk_questoes;
-- DROP TABLE IF EXISTS quiz_questions_bk_questoes;
-- DROP TABLE IF EXISTS review_schedule_fc_backup_prekarina;
