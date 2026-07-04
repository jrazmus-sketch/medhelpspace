-- schema-patch-lead-recovery.sql
--
-- Pre-verify lead recovery (2026-07-03). Adds the state the /api/cron/lead-recovery
-- job needs to re-engage UNVERIFIED leads without double-sending, plus a dedicated
-- attribution coupon for the "come back and finish" (Segment B) nudge.
--
-- Two segments, tracked INDEPENDENTLY on purpose:
--   • Segment A — finished all 15, never verified (completed_at set, verified_at NULL).
--       One magic-link email → recovery_a_sent_at.
--   • Segment B — abandoned mid-quiz (completed_at NULL, verified_at NULL).
--       Two nudges (+1d, then +3d to non-finishers) → recovery_b_step (0→1→2).
--
-- Why separate, not one shared counter: a Segment B lead can click the resume link,
-- finish the quiz, and still not verify — becoming Segment A. If both shared one
-- counter, their spent B-nudges would suppress the A email they now deserve. With
-- independent fields, A gates on recovery_a_sent_at IS NULL regardless of B history.
--
-- recovery_sent_at = timestamp of the MOST RECENT recovery email (any segment). Paces
-- the +3-day gap before Segment B's second nudge and acts as a general last-touch marker.
--
-- Idempotent. Apply with: node scripts/run-sql.js schema-patch-lead-recovery.sql

-- 1) Recovery tracking columns on leads.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS recovery_a_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recovery_b_step    SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_sent_at   TIMESTAMPTZ;

-- 2) Partial index for the recovery cron's scan (unverified + active only). The
--    verified drip already has leads_drip_verified_idx; this is its pre-verify twin.
CREATE INDEX IF NOT EXISTS leads_recovery_idx
  ON leads (created_at)
  WHERE verified_at IS NULL AND drip_status = 'active';

-- 3) Dedicated recovery coupons — ONE PER TURMA, mirroring WELCOME (REVALIDA5/10), so
--    recovery revenue is attributable separately. Turma-scoped rates (Justin, 2026-07-03):
--    revalida-2026-2 is ALREADY discounted on the storefront → 5% max; revalida-2027-1 → 10%.
--    Each code is locked to its turma via applies_to_cohort_slugs. The cron picks the
--    code by the lead's target_cohort (Segment B always defaults to 2026-2 → VOLTA5).
INSERT INTO coupons (code, discount_type, discount_value, active, applies_to_cohort_slugs, max_uses_per_user, notes)
SELECT 'VOLTA5', 'percent', 5, true, ARRAY['revalida-2026-2'], 1,
       'Recuperação do funil (Segmento B) — turma 2026-2 (já com preço promo → 5%). Código dedicado p/ atribuição.'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'VOLTA5');

INSERT INTO coupons (code, discount_type, discount_value, active, applies_to_cohort_slugs, max_uses_per_user, notes)
SELECT 'VOLTA10', 'percent', 10, true, ARRAY['revalida-2027-1'], 1,
       'Recuperação do funil (Segmento B) — turma 2027-1 (10%). Código dedicado p/ atribuição.'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'VOLTA10');

-- Converge on a re-run — enforces the per-turma scope + rate. This also RE-SCOPES the
-- earlier unscoped VOLTA10 (10% global) to revalida-2027-1 only.
UPDATE coupons
SET discount_type = 'percent', discount_value = 5, active = true,
    applies_to_cohort_slugs = ARRAY['revalida-2026-2'], max_uses_per_user = 1
WHERE UPPER(code) = 'VOLTA5';
UPDATE coupons
SET discount_type = 'percent', discount_value = 10, active = true,
    applies_to_cohort_slugs = ARRAY['revalida-2027-1'], max_uses_per_user = 1
WHERE UPPER(code) = 'VOLTA10';

-- Rollback (manual):
--   ALTER TABLE leads
--     DROP COLUMN IF EXISTS recovery_a_sent_at,
--     DROP COLUMN IF EXISTS recovery_b_step,
--     DROP COLUMN IF EXISTS recovery_sent_at;
--   DROP INDEX IF EXISTS leads_recovery_idx;
--   UPDATE coupons SET active = false WHERE UPPER(code) IN ('VOLTA5','VOLTA10');
