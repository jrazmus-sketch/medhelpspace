-- Free-funnel v2 (trust-first): verify-to-claim + lead scoring on `leads`.
--
-- Scope: FREE-FUNNEL-V2-SCOPE.md "Database (one /schema-patch)".
--   The funnel moves from "email at Q5 → immediately email raw input" (spam-cannon
--   risk) to a HYBRID model: soft capture at Q5 (unverified), then a 6-digit
--   verify-to-claim at the results step that unlocks the personalized plan +
--   flashcard demo and fires the delivery email. This patch adds the columns that
--   back that flow + the lead scoring/segmentation the drip cron reads.
--
-- All writes go through the capture/claim server actions (actions/magnet.ts) and
-- the drip cron via createAdminClient() (service_role, BYPASSRLS). `leads` keeps
-- its deny-all RLS + revoked anon/auth grants from schema-patch-leads.sql — this
-- patch only ADDs columns/indexes, so that posture is unchanged.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS); safe to
-- re-run. Run with: node scripts/run-sql.js schema-patch-leads-verify-claim.sql

-- ── Verification + first name (the "hard verify-to-claim" step) ───────────────

ALTER TABLE leads
  -- null = unverified (soft-captured only). Set when a 6-digit code is confirmed.
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ,
  -- captured at the code step ("Como podemos te chamar?"); personalizes emails.
  ADD COLUMN IF NOT EXISTS first_name       TEXT,

  -- ── Completion signal (lead scoring / drip segmentation) ────────────────────
  ADD COLUMN IF NOT EXISTS questions_answered SMALLINT,   -- 0..15
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ,  -- answered all 15

  -- ── 6-digit code storage (short-lived; service-role only, deny-all RLS) ──────
  ADD COLUMN IF NOT EXISTS verification_code TEXT,        -- current 6-digit code
  ADD COLUMN IF NOT EXISTS code_sent_at     TIMESTAMPTZ,  -- powers expiry + resend throttle
  ADD COLUMN IF NOT EXISTS code_attempts    SMALLINT NOT NULL DEFAULT 0,  -- wrong-guess cap

  -- ── Durable result link token ("meu material" page) ─────────────────────────
  -- The /simulado-honesto/resultado?lead=<token> page + every email "ver meu
  -- material" link resolve the lead by THIS token (not the PK, not the
  -- unsubscribe_token). gen_random_uuid() is volatile → existing rows each get a
  -- distinct value on ADD COLUMN, so the unique index below holds.
  ADD COLUMN IF NOT EXISTS result_token     UUID NOT NULL DEFAULT gen_random_uuid();

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Durable-page + email-link lookups resolve the lead by result_token.
CREATE UNIQUE INDEX IF NOT EXISTS leads_result_token_uniq ON leads (result_token);

-- The drip now targets VERIFIED active leads only (unverified = suppressed, to
-- protect a young sending domain). Narrow partial index for the cron's scan.
CREATE INDEX IF NOT EXISTS leads_drip_verified_idx
  ON leads (drip_step, verified_at)
  WHERE drip_status = 'active' AND verified_at IS NOT NULL;

-- ── Rollback (manual) ─────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS leads_drip_verified_idx;
-- DROP INDEX IF EXISTS leads_result_token_uniq;
-- ALTER TABLE leads
--   DROP COLUMN IF EXISTS result_token,
--   DROP COLUMN IF EXISTS code_attempts,
--   DROP COLUMN IF EXISTS code_sent_at,
--   DROP COLUMN IF EXISTS verification_code,
--   DROP COLUMN IF EXISTS completed_at,
--   DROP COLUMN IF EXISTS questions_answered,
--   DROP COLUMN IF EXISTS first_name,
--   DROP COLUMN IF EXISTS verified_at;
