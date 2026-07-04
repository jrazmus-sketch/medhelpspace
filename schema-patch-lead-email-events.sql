-- schema-patch-lead-email-events.sql
--
-- Per-lead email engagement log (2026-07-04). Backs the "Comunicação" section of the
-- /admin/leads detail drawer: which funnel emails a lead was SENT, and — once Resend
-- open+click tracking is enabled — whether they were DELIVERED, OPENED, and CLICKED.
--
-- Before this, lead email history was only INFERABLE from `leads.drip_step` (a 0→5
-- counter) + `last_emailed_at` (one timestamp). There was no record of individual
-- sends and no engagement signal at all — the Resend webhook only processed
-- bounced/complained (for suppression) and ignored delivered/opened/clicked.
--
-- Two writers, both service-role (deny-all RLS, like leads / funnel_events):
--   • SEND time — lib/email.ts sendTemplateEmail() inserts one 'sent' row per lead-*
--     email right after Resend returns the message id. This row carries the `kind`
--     (lead-d0 / lead-d1 / lead-code / lead-recover-*) and `resend_id`, and is the
--     anchor that NAMES the email in the drawer.
--   • WEBHOOK — /api/email/resend-webhook inserts delivered/opened/clicked/bounced/
--     complained rows keyed by the same `resend_id`, but ONLY when the recipient
--     matches a known lead (member/admin email engagement is never logged).
--
-- The drawer groups rows by `resend_id`: the 'sent' row gives the kind + exact send
-- time; the engagement rows in the same group give delivered/opens/clicks.
--
-- REQUIRES (manual, one-time): enable Open + Click tracking in the Resend dashboard
-- (Domains → the sending domain → toggle "Open tracking" + "Click tracking"), and add
-- the delivered/opened/clicked events to the webhook subscription. Without that, only
-- 'sent' (send-time) + bounced/complained (already subscribed) rows appear. Apple Mail
-- Privacy Protection inflates OPENS (pre-fetched pixels) — treat CLICKS as the reliable
-- engagement signal.
--
-- Idempotent. Apply with: node scripts/run-sql.js schema-patch-lead-email-events.sql

CREATE TABLE IF NOT EXISTS lead_email_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resend_id   TEXT,                                   -- Resend message id; groups a send + its engagement
  email       TEXT        NOT NULL,                   -- recipient (lowercased); links to leads.email
  kind        TEXT,                                   -- template kind (lead-d0…); set on 'sent' rows only
  event_type  TEXT        NOT NULL,                   -- sent|delivered|delivery_delayed|opened|clicked|bounced|complained
  url         TEXT,                                   -- clicked link (email.clicked only)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Domain guard (typed, idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lead_email_events_type_check') THEN
    ALTER TABLE lead_email_events ADD CONSTRAINT lead_email_events_type_check
      CHECK (event_type IN (
        'sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained'
      ));
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Drawer lookup: all events for a lead's address, newest first.
CREATE INDEX IF NOT EXISTS lead_email_events_email_idx
  ON lead_email_events (email, created_at DESC);

-- Grouping + kind resolution by Resend message id.
CREATE INDEX IF NOT EXISTS lead_email_events_resend_idx
  ON lead_email_events (resend_id) WHERE resend_id IS NOT NULL;

-- Dedup the ONCE-per-email events (a Svix webhook retry must not double-count a
-- delivery/bounce/complaint, and the send path must not double-insert 'sent'). Opens
-- and clicks are intentionally NOT deduped — repeat engagement is genuine signal.
CREATE UNIQUE INDEX IF NOT EXISTS lead_email_events_once_uniq
  ON lead_email_events (resend_id, event_type)
  WHERE resend_id IS NOT NULL
    AND event_type IN ('sent', 'delivered', 'bounced', 'complained');

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Enable RLS with NO policies = deny-all to anon/authenticated. service_role
-- (the send path + webhook + admin drawer reads) bypasses RLS. Belt-and-suspenders
-- REVOKE because Supabase auto-grants anon/authenticated on every new table.
ALTER TABLE lead_email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lead_email_events FROM anon, authenticated;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS lead_email_events;
