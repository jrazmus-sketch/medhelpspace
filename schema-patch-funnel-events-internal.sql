-- schema-patch-funnel-events-internal.sql
-- Internal-traffic flag for the top-of-funnel beacons. funnel_events rows are
-- anonymous (client session id, no auth), so the team's own visits to
-- /questoes-revalida inflate the Landed/Started stages on /admin/leads with no
-- way to filter them. Fix: the proxy stamps a long-lived `mhs_internal` cookie
-- on any browser whose logged-in user has an admin role the next time it opens
-- /admin; /api/funnel-event then records is_internal=true for beacons from that
-- browser. The admin funnel read (lib/admin/funnel.ts) buckets internal events
-- separately and the dashboard hides them unless QA mode is on. Historical rows
-- stay false — they can't be attributed retroactively (test-LEAD sessions are
-- excluded at read time via leads.funnel_session_id instead, no flag needed).
--
-- Run with: node scripts/run-sql.js schema-patch-funnel-events-internal.sql

ALTER TABLE funnel_events
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE funnel_events DROP COLUMN IF EXISTS is_internal;
