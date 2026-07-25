-- schema-patch-email-events-feed-index.sql
--
-- Backs the /admin/email-clicks global feed (2026-07-11). That feed now logs a click
-- event for EVERY recipient (lead, member, or neither) — not just leads — so
-- `lead_email_events` (a general email-events log despite its legacy name) will grow
-- with delivered/opened/clicked rows for all mail we send.
--
-- The feed's hot query is: the most-recent CLICKED events, newest first
--   SELECT ... FROM lead_email_events WHERE event_type = 'clicked'
--   ORDER BY created_at DESC LIMIT 500
-- A partial index on created_at (predicate event_type='clicked') turns that into an
-- index-only range scan with no sort, and stays small (clicks are a fraction of all
-- events). The identity join (email → profiles / leads) uses those tables' own email
-- indexes and is bounded to <=500 addresses per page, so it needs nothing here.
--
-- The existing `lead_email_events_resend_idx` already covers the feed's second query
-- (resolve each click's `kind` via its 'sent' anchor by resend_id).
--
-- Idempotent. No RLS change (table already ENABLE ROW LEVEL SECURITY, deny-all +
-- REVOKE from anon/authenticated; service_role bypasses). Reversible (see rollback).
-- Apply with: node scripts/run-sql.js schema-patch-email-events-feed-index.sql

CREATE INDEX IF NOT EXISTS lead_email_events_clicked_recent_idx
  ON lead_email_events (created_at DESC)
  WHERE event_type = 'clicked';

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS lead_email_events_clicked_recent_idx;
