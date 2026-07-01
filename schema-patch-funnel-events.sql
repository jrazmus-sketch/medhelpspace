-- schema-patch-funnel-events.sql
-- Top-of-funnel counter for the /simulado-honesto paid-traffic funnel. Records the
-- PRE-capture steps that the leads table can't see: a lead row is only created at
-- Q5 (soft capture), so everyone who lands and bounces before Q5 is invisible and
-- landing→capture rate (the #1 ad/landing-fit metric) is uncomputable. This table
-- captures 'landing' and 'quiz_start'; combined with leads (capture → verified →
-- converted) it yields the full land→sale funnel by source/campaign in /admin.
--
-- Written ONLY server-side via createAdminClient() (service_role) from the
-- /api/funnel-event route. Deny-all RLS + REVOKE from anon/authenticated, mirroring
-- leads / email_templates (Supabase default-grants anon/auth on every new table —
-- must revoke).
--
-- Run with: node scripts/run-sql.js schema-patch-funnel-events.sql

CREATE TABLE IF NOT EXISTS funnel_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type   TEXT NOT NULL,      -- 'landing' | 'quiz_start'
  session_id   TEXT NOT NULL,      -- client-generated (crypto.randomUUID), dedups repeat views
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- attribution (mirrors leads; null / 'organic' for SEO visitors)
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_term     TEXT,
  utm_content  TEXT,
  gclid        TEXT
);

-- Domain guard (typed, idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnel_events_type_check') THEN
    ALTER TABLE funnel_events ADD CONSTRAINT funnel_events_type_check
      CHECK (event_type IN ('landing', 'quiz_start'));
  END IF;
END $$;

-- One row per (session, event_type): a refresh / component re-mount must never
-- inflate counts. The route upserts with ignoreDuplicates on this index.
CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_session_type_uniq
  ON funnel_events (session_id, event_type);

-- Drives the admin funnel aggregation (by type / day / source).
CREATE INDEX IF NOT EXISTS funnel_events_type_created_idx
  ON funnel_events (event_type, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Enable RLS with NO policies = deny-all to anon/authenticated. service_role
-- (the /api/funnel-event route + the admin dashboard reads) bypasses RLS.
ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON funnel_events FROM anon, authenticated;

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS funnel_events;
