-- Close the Supabase "rls_disabled_in_public" advisor warning (email of 06 Jul 2026).
--
-- Four public-schema tables had RLS OFF *and* the default anon/authenticated
-- grants, so anyone with the public anon key could read/write them through the
-- auto-generated PostgREST API. Audited with scratchpad/check-rls.js — every
-- other public table (59) is already RLS-on with policies.
--
-- pages_bk_simnew, quiz_questions_bk_simnew, quiz_attempts_bk_simnew,
-- nav_items_bk_simnew — one-time safety backups created ONCE by
-- scripts/apply-simulados-new.js (CREATE TABLE ... AS SELECT) as a rollback net
-- for the 2026-07-01 simulados-new import. Nothing in the app reads them (only
-- the import script's re-apply guard references the name), no foreign keys point
-- at them, and the import has been live + verified in production for 6 days.
-- quiz_attempts_bk_simnew (29 rows of member quiz activity) is why the advisor
-- flags CRITICAL. Same remediation as the 12 Jun backups: dropped.
--
-- Run with: node scripts/run-sql.js schema-patch-drop-simnew-backups.sql

-- ── Drop the completed-migration backup tables (no FKs reference them) ────────

DROP TABLE IF EXISTS pages_bk_simnew;
DROP TABLE IF EXISTS quiz_questions_bk_simnew;
DROP TABLE IF EXISTS quiz_attempts_bk_simnew;
DROP TABLE IF EXISTS nav_items_bk_simnew;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- These were disposable snapshots protecting the 2026-07-01 simulados-new
-- import, which has been verified in production since. They cannot be
-- meaningfully recreated (live data has moved on) and are no longer a viable
-- rollback source. If that import ever needed reverting it would be done from a
-- point-in-time DB restore, not these tables.
