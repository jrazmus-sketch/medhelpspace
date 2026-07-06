-- schema-patch-leads-is-test.sql
--
-- Test lead marker for /admin/leads (2026-07-06). Allows admins to tag leads
-- captured during internal testing so they can be filtered out from real data.
--
-- Values:
--   • true  — internal test (created by staff testing the funnel)
--   • false — real lead (default, explicitly marked)
--
-- Usage:
--   • Detail drawer checkbox toggles this value for the selected lead
--   • Filter UI toggles visibility (default: hide tests)
--   • Bulk action: mark multiple as test at once
--
-- `leads` already has deny-all RLS + revoked anon/auth grants (schema-patch-leads.sql);
-- a new column needs no further RLS work. Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Apply with: node scripts/run-sql.js schema-patch-leads-is-test.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

-- Index for filtering out tests (most queries will be "WHERE is_test = false")
CREATE INDEX IF NOT EXISTS leads_is_test_idx
  ON leads (is_test) WHERE is_test = true;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_is_test_idx;
-- ALTER TABLE leads DROP COLUMN IF EXISTS is_test;
