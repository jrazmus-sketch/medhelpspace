-- schema-patch-leads-archive.sql
--
-- Soft-archive marker for /admin/leads Phase 3C bulk archive (2026-07-06).
-- Archiving is the "get this out of my list" action for stale/irrelevant leads —
-- a soft delete, fully reversible (team decision: never hard-delete lead rows;
-- they carry attribution + email history other tables reference by email).
--
-- Values:
--   • true  — archived (hidden from /admin/leads by default; "Mostrar arquivados"
--             toggle reveals; bulk Desarquivar restores)
--   • false — live lead (default)
--
-- Archived leads keep their drip_status untouched — archiving does NOT stop the
-- drip. Admins who want both use bulk unsubscribe + bulk archive together.
--
-- `leads` already has deny-all RLS + revoked anon/auth grants (schema-patch-leads.sql);
-- a new column needs no further RLS work. Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Apply with: node scripts/run-sql.js schema-patch-leads-archive.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Partial index mirrors leads_is_test_idx: the archived set stays small, and the
-- admin list's default view excludes it.
CREATE INDEX IF NOT EXISTS leads_is_archived_idx
  ON leads (is_archived) WHERE is_archived = true;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_is_archived_idx;
-- ALTER TABLE leads DROP COLUMN IF EXISTS is_archived;
