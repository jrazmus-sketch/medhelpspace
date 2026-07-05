-- Widen leads.target_cohort to accept the 2027.2 turma (slug 'revalida-20272' —
-- note: NO hyphen before the final 2, matching the cohort row created in the admin
-- panel; the placeholder hint elsewhere said 'revalida-2027-2', which is WRONG).
--
-- Needed by the new gift-first flashcards magnet (/flashcards-revalida), whose exam
-- picker offers 2026.2 / 2027.1 / 2027.2 up front. Also widens the 10% WELCOME
-- coupon REVALIDA10 (and its recovery twin VOLTA10) to redeem on the 2027.2 cohort,
-- so a 2027.2 lead's welcome discount is actually applicable at checkout.
--
-- Keep in sync with WELCOME_COUPONS / RECOVERY_COUPONS / VALID_TARGET_COHORTS in
-- app/src/lib/magnet/links.ts.
--
-- Run with: node scripts/run-sql.js schema-patch-target-cohort-add-20272.sql

-- 1) Widen the CHECK constraint (drop + re-add — it already exists with 2 values).
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
  CHECK (target_cohort IN ('revalida-2026-2', 'revalida-2027-1', 'revalida-20272'));

-- 2) Extend the 10% coupons' cohort scope to include the 2027.2 turma. Idempotent:
--    only appends when the slug isn't already present. NULL scope = all cohorts, so
--    those are skipped; REVALIDA10 / VOLTA10 are explicitly scoped to 2027.1 today.
UPDATE coupons
  SET applies_to_cohort_slugs = array_append(applies_to_cohort_slugs, 'revalida-20272')
  WHERE code IN ('REVALIDA10', 'VOLTA10')
    AND applies_to_cohort_slugs IS NOT NULL
    AND NOT ('revalida-20272' = ANY (applies_to_cohort_slugs));

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
-- ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
--   CHECK (target_cohort IN ('revalida-2026-2', 'revalida-2027-1'));
-- UPDATE coupons SET applies_to_cohort_slugs = array_remove(applies_to_cohort_slugs, 'revalida-20272')
--   WHERE code IN ('REVALIDA10', 'VOLTA10');
