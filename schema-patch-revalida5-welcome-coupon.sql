-- schema-patch-revalida5-welcome-coupon.sql
--
-- Discount-cycle change for the reta-final turma (revalida-2026-2), 2026-07-02.
--
-- Background: revalida-2026-2 is ALREADY discounted on the storefront
-- (cohorts.sale_price_cents). Its funnel promo was stacking a LARGE second
-- discount on top — RETA2026 (result page + D1/D2/D4/D7 drip) and ULTIMA2026
-- (final email, ~R$2.990). We can't offer those big promo discounts on a turma
-- that's already marked down publicly, so the funnel now mirrors revalida-2027-1:
-- a single small WELCOME code auto-applied at the end of the free test and sent
-- in one follow-up email.
--
--   revalida-2026-2 -> REVALIDA5  (5%, this turma only)   [NEW]
--   revalida-2027-1 -> REVALIDA10 (10%, this turma only)  [re-scoped]
--   RETA2026, ULTIMA2026 -> deactivated                    [removed]
--
-- Each welcome code is locked to its own turma via applies_to_cohort_slugs, so
-- REVALIDA5 can never redeem on 2027.1 and REVALIDA10 can never redeem on 2026.2.
--
-- Idempotent — safe to re-run. Apply with:
--   node scripts/run-sql.js schema-patch-revalida5-welcome-coupon.sql
--
-- Rollback (restore the old cycle):
--   UPDATE coupons SET active = true  WHERE UPPER(code) IN ('RETA2026','ULTIMA2026');
--   UPDATE coupons SET applies_to_cohort_slugs = NULL WHERE UPPER(code) = 'REVALIDA10';
--   UPDATE coupons SET active = false WHERE UPPER(code) = 'REVALIDA5';
--   (and revert the code changes in the same commit)
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here — mirrors scripts/seed-test-coupons.sql.

-- 1) Create the 5% welcome coupon for revalida-2026-2 (create-if-missing).
--    The unique index is on upper(code), so guard on UPPER(code).
INSERT INTO coupons (code, discount_type, discount_value, active, applies_to_cohort_slugs, max_uses_per_user, notes)
SELECT 'REVALIDA5', 'percent', 5, true, ARRAY['revalida-2026-2'], 1,
       'Boas-vindas 5% do funil (fim do simulado + 1 e-mail). Só revalida-2026-2 (já com preço promo na loja).'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'REVALIDA5');

-- 2) Enforce the canonical config for REVALIDA5 (converges an existing row too).
UPDATE coupons
SET discount_type = 'percent',
    discount_value = 5,
    active = true,
    applies_to_cohort_slugs = ARRAY['revalida-2026-2'],
    max_uses_per_user = 1
WHERE UPPER(code) = 'REVALIDA5';

-- 3) Lock REVALIDA10 to revalida-2027-1 ONLY (it may currently be unscoped/global).
UPDATE coupons
SET discount_type = 'percent',
    discount_value = 10,
    active = true,
    applies_to_cohort_slugs = ARRAY['revalida-2027-1']
WHERE UPPER(code) = 'REVALIDA10';

-- 4) Remove the old large-discount cycle from the reta-final turma.
--    Deactivating also kills any RETA2026 links already sent in earlier drip emails.
UPDATE coupons
SET active = false
WHERE UPPER(code) IN ('RETA2026', 'ULTIMA2026');

-- Post-apply sanity check (read-only):
--   SELECT code, discount_type, discount_value, active, applies_to_cohort_slugs
--   FROM coupons WHERE UPPER(code) IN ('REVALIDA5','REVALIDA10','RETA2026','ULTIMA2026')
--   ORDER BY code;
