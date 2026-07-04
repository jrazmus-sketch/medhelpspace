-- schema-patch-leads-capture-context.sql
--
-- Capture-time context on `leads` (2026-07-04). Records the device / geography /
-- referrer a lead arrived with, plus the funnel_events session id that links a lead
-- row back to its anonymous pre-capture journey (landing → quiz_start). Surfaced in
-- the /admin/leads detail drawer.
--
-- WHY NOW: none of this can be backfilled — it only exists at the moment of capture.
-- Captured server-side in actions/magnet.ts captureLeadAndUnlock (the Q5 soft capture,
-- the earliest server touch that knows the email):
--   • user_agent / device_type — parsed from the request User-Agent header.
--   • geo_country / geo_region / geo_city — read from Vercel's edge geo headers
--     (x-vercel-ip-country / -country-region / -city); no external geo-IP service.
--   • landing_referrer / landing_path — passed from the client (document.referrer +
--     first landing path), which the server can't otherwise see.
--   • funnel_session_id — the client's mhs_fsid, joining leads ⇄ funnel_events so the
--     full land→sale path is reconstructable per lead.
--
-- First-touch wins: captureLeadAndUnlock only sets these when still null (a re-submit
-- never overwrites the original capture context).
--
-- `leads` already has deny-all RLS + revoked anon/auth grants (schema-patch-leads.sql);
-- new columns need no further RLS work. Idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Apply with: node scripts/run-sql.js schema-patch-leads-capture-context.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS user_agent        TEXT,
  ADD COLUMN IF NOT EXISTS device_type       TEXT,   -- mobile | tablet | desktop | unknown
  ADD COLUMN IF NOT EXISTS geo_country       TEXT,   -- ISO-2 (e.g. 'BR')
  ADD COLUMN IF NOT EXISTS geo_region        TEXT,   -- state/region code
  ADD COLUMN IF NOT EXISTS geo_city          TEXT,
  ADD COLUMN IF NOT EXISTS landing_referrer  TEXT,
  ADD COLUMN IF NOT EXISTS landing_path      TEXT,
  ADD COLUMN IF NOT EXISTS funnel_session_id TEXT;

-- Join leads ⇄ funnel_events (the pre-capture landing/quiz_start beacons).
CREATE INDEX IF NOT EXISTS leads_funnel_session_idx
  ON leads (funnel_session_id) WHERE funnel_session_id IS NOT NULL;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_funnel_session_idx;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS user_agent,
--   DROP COLUMN IF EXISTS device_type,
--   DROP COLUMN IF EXISTS geo_country,
--   DROP COLUMN IF EXISTS geo_region,
--   DROP COLUMN IF EXISTS geo_city,
--   DROP COLUMN IF EXISTS landing_referrer,
--   DROP COLUMN IF EXISTS landing_path,
--   DROP COLUMN IF EXISTS funnel_session_id;
