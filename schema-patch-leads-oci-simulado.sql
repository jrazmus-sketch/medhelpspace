-- schema-patch-leads-oci-simulado.sql
-- Two more Google Ads Offline Conversion Import (OCI) upload markers on leads,
-- for the /simulado-revalida funnel.
--
-- WHY: the original OCI pair (schema-patch-leads-oci.sql) reports "Lead verified"
-- on leads.verified_at. In the simulado v2 funnel verified_at is only stamped when
-- the lead CLICKS AN EMAILED LINK (/simulado-revalida/acesso or /api/leads/turma) —
-- but the v2 exam starts immediately on-site, with the emailed link demoted to a
-- resume aid. So a lead who signs up, answers 100 questions and submits never
-- clicks anything, keeps verified_at NULL, and is invisible to Google Ads. A
-- campaign pointed at /simulado-revalida would show near-zero conversions and
-- Smart Bidding would have nothing to learn from.
--
-- The fix is NOT to stamp verified_at at signup: verified_at means "this address
-- was confirmed deliverable", the drip/recovery crons branch on it, and marking an
-- unconfirmed address as verified would violate the sending-domain discipline.
-- Instead this funnel reports its own two events:
--   • "Simulado started"    — time sim_entered_at,   value 0
--   • "Simulado submitted"  — time sim_completed_at, value 0
-- Each gets its own marker so it exports exactly once, matching the existing pair.
--
-- leads already has deny-all RLS + revoked anon/auth grants, so new columns need
-- no further RLS work.
--
-- Run with: node scripts/run-sql.js schema-patch-leads-oci-simulado.sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS oci_sim_started_uploaded_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS oci_sim_submitted_uploaded_at TIMESTAMPTZ;

-- Backfill guard: leads that entered the simulado BEFORE these conversion actions
-- existed in Google Ads have no matching action to upload into, and their clicks
-- are almost certainly outside Google's click-to-conversion window anyway. Stamp
-- everything that already exists as "uploaded" so the first real export contains
-- only conversions from the new campaign onward.
UPDATE leads
   SET oci_sim_started_uploaded_at = now()
 WHERE sim_entered_at IS NOT NULL
   AND oci_sim_started_uploaded_at IS NULL;

UPDATE leads
   SET oci_sim_submitted_uploaded_at = now()
 WHERE sim_completed_at IS NOT NULL
   AND oci_sim_submitted_uploaded_at IS NULL;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE leads DROP COLUMN IF EXISTS oci_sim_started_uploaded_at;
-- ALTER TABLE leads DROP COLUMN IF EXISTS oci_sim_submitted_uploaded_at;
