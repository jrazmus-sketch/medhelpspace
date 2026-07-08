-- schema-patch-lead-events.sql
--
-- Per-lead ON-SITE action log (2026-07-08). Backs the "Atividade na plataforma"
-- section of the /admin/leads detail drawer: on-site actions a KNOWN lead takes
-- AFTER capture (as opposed to lead_email_events = email engagement, and
-- funnel_events = anonymous pre-capture beacons keyed by session_id).
--
-- First writer + event: the flashcards reward's "Ver todos os recursos da plataforma"
-- link (→ homepage). The click fires trackLeadEvent({token, event}) (actions/magnet.ts),
-- authed by the lead's result_token, which inserts one row here. GA4 already has the
-- aggregate via utm_campaign=ver-todos-recursos; this table is the per-lead record.
--
-- event_type is an APP-LEVEL allowlist (LEAD_SITE_EVENTS in actions/magnet.ts) rather
-- than a DB CHECK, so adding a new on-site event is a one-line code change (no ALTER).
-- Known types: 'clicked_ver_recursos'. Keep the drawer's leads.siteEvent.* i18n keys
-- in sync with whatever gets added here.
--
-- Single writer, service-role (deny-all RLS, like leads / lead_email_events / funnel_events).
--
-- Idempotent. Apply with: node scripts/run-sql.js schema-patch-lead-events.sql

CREATE TABLE IF NOT EXISTS lead_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,   -- app-level allowlist; e.g. 'clicked_ver_recursos'
  metadata    JSONB,                  -- optional per-event extras (reserved; unused today)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Drawer lookup: all events for one lead, newest first.
CREATE INDEX IF NOT EXISTS lead_events_lead_idx
  ON lead_events (lead_id, created_at DESC);

-- Aggregate "how often does this happen" counts by type (across all leads).
CREATE INDEX IF NOT EXISTS lead_events_type_idx
  ON lead_events (event_type, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Enable RLS with NO policies = deny-all to anon/authenticated. service_role
-- (the trackLeadEvent write + admin drawer read) bypasses RLS. Belt-and-suspenders
-- REVOKE because Supabase auto-grants anon/authenticated on every new table.
ALTER TABLE lead_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lead_events FROM anon, authenticated;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS lead_events;
