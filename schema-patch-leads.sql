-- leads: anonymous email captures from the /simulado-honesto free magnet.
--
-- Scope (locked 2026-06-29) — free-funnel build, FREE-FUNNEL-BUILD-SPEC.md §2:
--   - NOT auth.users / profiles. A lead is a non-member; it becomes a member
--     only via /checkout. Keeping leads separate avoids polluting member
--     tables and the handle_new_user trigger.
--   - Written ONLY by the capture server action (actions/magnet.ts) and the
--     drip cron (/api/cron/lead-drip), both via createAdminClient() (service_role,
--     BYPASSRLS). No browser access (browser Supabase client hangs in this app).
--   - Deny-all RLS + REVOKE from anon/authenticated, mirroring email_templates /
--     email_log (Supabase default-grants anon/auth on new tables — must revoke).
--
-- Run with: node scripts/run-sql.js schema-patch-leads.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- attribution (null / 'organic' for SEO visitors)
  utm_source         TEXT,
  utm_medium         TEXT,
  utm_campaign       TEXT,
  utm_term           TEXT,
  utm_content        TEXT,
  source             TEXT NOT NULL DEFAULT 'simulado-honesto',

  -- magnet result → personalization
  score              SMALLINT,                       -- 0..15
  weak_specialty_ids INTEGER[] NOT NULL DEFAULT '{}',
  result             JSONB,                          -- [{question_id, specialty_id, is_correct}]

  -- drip state machine
  drip_step          SMALLINT NOT NULL DEFAULT 0,    -- last step sent (0 = only D0 welcome)
  drip_status        TEXT NOT NULL DEFAULT 'active', -- active | converted | unsubscribed | bounced
  last_emailed_at    TIMESTAMPTZ,
  converted_at       TIMESTAMPTZ,
  unsubscribed_at    TIMESTAMPTZ,

  unsubscribe_token  UUID NOT NULL DEFAULT gen_random_uuid()
);

-- Guard the drip_status domain (typed, idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_drip_status_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_drip_status_check
      CHECK (drip_status IN ('active', 'converted', 'unsubscribed', 'bounced'));
  END IF;
END $$;

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- One lead per email (case-insensitive); the capture action upserts on this.
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_lower_uniq ON leads (lower(email));

-- Drives the daily drip cron's "active leads due for the next step" scan.
CREATE INDEX IF NOT EXISTS leads_drip_active_idx
  ON leads (drip_status, drip_step, created_at)
  WHERE drip_status = 'active';

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Enable RLS with NO policies = deny-all to anon/authenticated. service_role
-- (the capture action + drip cron) bypasses RLS. Belt-and-suspenders REVOKE
-- because Supabase auto-grants anon/authenticated on every new table.

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON leads FROM anon, authenticated;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS leads;
