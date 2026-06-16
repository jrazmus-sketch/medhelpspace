-- Close the Supabase "rls_disabled_in_public" advisor warnings (email of 12 Jun 2026).
--
-- Four public-schema tables had RLS OFF *and* the default anon/authenticated
-- grants, so anyone with the public anon key could read/write them through the
-- auto-generated PostgREST API. Audited with scratch/rls-audit.js — every other
-- table (37) is already RLS-on with policies.
--
-- 1) email_log — the real concern. Holds user_id + which lifecycle email each
--    member received. Read = member enumeration (whose membership is expiring,
--    cohort id in context_id). Write = abuse: the lifecycle cron treats an
--    existing row as "already sent, skip", so an injected row suppresses a real
--    expiry/unlock email; deleting the log causes duplicate sends. Fix: enable
--    RLS with NO policies => deny-all to anon/authenticated. The only legitimate
--    writer is the Vercel cron via createAdminClient() (service_role, which has
--    BYPASSRLS), so it is unaffected.
--
-- 2-4) quiz_questions_feedback_backup_chatgpt_clean,
--      quiz_questions_feedback_backup_legacy_migration,
--      quiz_questions_h4_emoji_backup — one-time safety backups from completed
--      migrations (clean-chatgpt-quiz-feedback.js / migrate-legacy-quiz-feedback.js
--      / clean-h4-emoji-prefixes.js). Nothing in the app reads them. Dropped.
--
-- Run with: node scripts/run-sql.js schema-patch-enable-rls-exposed-tables.sql

-- ── email_log: enable RLS (deny-all; service_role still bypasses) ────────────

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- ── Drop the completed-migration backup tables ───────────────────────────────

DROP TABLE IF EXISTS quiz_questions_feedback_backup_chatgpt_clean;
DROP TABLE IF EXISTS quiz_questions_feedback_backup_legacy_migration;
DROP TABLE IF EXISTS quiz_questions_h4_emoji_backup;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- ALTER TABLE email_log DISABLE ROW LEVEL SECURITY;
-- The dropped backup tables were disposable snapshots; if ever needed again,
-- re-run the relevant scripts/*.js migration with its --backup step.
