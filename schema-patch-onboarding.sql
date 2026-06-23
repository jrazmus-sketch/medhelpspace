-- Onboarding / "Comece por aqui" walkthrough state
-- Run with: node scripts/run-sql.js schema-patch-onboarding.sql
--
-- Adds per-user state for the new-member walkthrough:
--   onboarding_dismissed  — keys of the coachmark tips the user has closed (X)
--   onboarding_seen_at    — first time the user opened the guide / dismissed the
--                           welcome card (null = brand new, never engaged)
--
-- Reads ride along for free: GET /api/profile does select("*"), so AuthProvider
-- exposes both fields on `profile`. Writes go through POST /api/onboarding using
-- the user-scoped client, so the existing profiles_update_own RLS policy (id =
-- auth.uid(), role unchanged) is the access control — no new policy needed.

-- ── profiles: onboarding state ────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_dismissed TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_seen_at TIMESTAMPTZ;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_dismissed;
-- ALTER TABLE profiles DROP COLUMN IF EXISTS onboarding_seen_at;
