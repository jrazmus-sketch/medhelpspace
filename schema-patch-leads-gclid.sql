-- schema-patch-leads-gclid.sql
-- Add the Google Ads click id (gclid) to leads, for per-keyword attribution and
-- future Google Ads Offline Conversion Import (upload server-verified conversions
-- back to Google, keyed on gclid). Captured at Q5 soft-capture alongside UTM
-- (actions/magnet.ts captureLeadAndUnlock), threaded from the landing URL query
-- string exactly like the utm_* params.
--
-- WHY NOW: gclid cannot be backfilled. If it isn't stored at click time, per-
-- keyword attribution and offline conversion import are impossible forever after.
-- leads already has deny-all RLS + revoked anon/auth grants, so a new column needs
-- no further RLS work.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-gclid.sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid TEXT;

-- Partial index: attribution queries filter to the leads that came from a Google ad.
CREATE INDEX IF NOT EXISTS leads_gclid_idx ON leads (gclid) WHERE gclid IS NOT NULL;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_gclid_idx;
-- ALTER TABLE leads DROP COLUMN IF EXISTS gclid;
