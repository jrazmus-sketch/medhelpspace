-- schema-patch-leads-oci.sql
-- Google Ads Offline Conversion Import (OCI) upload markers on leads —
-- attribution Phase 2 (FREE-FUNNEL-V2-SCOPE.md). A lead contributes up to two
-- conversions that upload at different times ("Lead verified" on verified_at,
-- "Purchase" on converted_at), so each gets its own marker; a conversion is
-- stamped once its CSV row has been uploaded to Google, guaranteeing it never
-- exports twice.
--
-- leads already has deny-all RLS + revoked anon/auth grants, so new columns need
-- no further RLS work.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-oci.sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS oci_verified_uploaded_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS oci_purchase_uploaded_at TIMESTAMPTZ;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE leads DROP COLUMN IF EXISTS oci_verified_uploaded_at;
-- ALTER TABLE leads DROP COLUMN IF EXISTS oci_purchase_uploaded_at;
