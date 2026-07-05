-- Flashcards funnel v2 — the "Ainda não decidi" (undecided) turma segment.
--
-- Adds 'undecided' as an allowed leads.target_cohort so the gift-first flashcards
-- picker can offer a 4th option for leads who haven't chosen a turma yet, and seeds
-- FLASH5 — an ALL-TURMA welcome coupon (applies_to_cohort_slugs = NULL) so an
-- undecided lead's welcome email still carries a redeemable discount; they pick the
-- turma at checkout and apply FLASH5 there. 5% mirrors the 2026.2 welcome rate.
--
-- Keep in sync with VALID_TARGET_COHORTS / WELCOME_COUPONS in
-- app/src/lib/magnet/links.ts.
--
-- Run with: node scripts/run-sql.js schema-patch-flashcards-undecided.sql

-- 1) Widen the CHECK constraint (drop + re-add — already exists with 3 values).
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
  CHECK (target_cohort IN ('revalida-2026-2', 'revalida-2027-1', 'revalida-20272', 'undecided'));

-- 2) Seed the all-turma welcome coupon FLASH5 (idempotent — unique on UPPER(code)).
INSERT INTO coupons (code, discount_type, discount_value, applies_to_cohort_slugs, active, max_uses_per_user, notes)
SELECT 'FLASH5', 'percent', 5, NULL, true, 1,
       'Flashcards funnel — welcome coupon for undecided leads; valid on any turma.'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'FLASH5');

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
-- ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
--   CHECK (target_cohort IN ('revalida-2026-2', 'revalida-2027-1', 'revalida-20272'));
-- UPDATE coupons SET active = false WHERE UPPER(code) = 'FLASH5';
