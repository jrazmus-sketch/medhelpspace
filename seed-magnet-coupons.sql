-- Magnet funnel discount ladder — 2026.2 ONLY (FREE-FUNNEL-BUILD-SPEC.md §6.5).
-- Both scoped to revalida-2026-2 so redeem_coupon()/preview_coupon() raise
-- COUPON_NOT_VALID_FOR_COHORT on any other cohort (Guarantee B — DB hard stop).
-- 2027.1 is NEVER discounted: no code applies to it.
--
-- Idempotent (WHERE NOT EXISTS on UPPER(code)) so it's safe to re-run.
-- Run with: node scripts/run-sql.js seed-magnet-coupons.sql

-- RETA2026 — R$700 off → R$3.290. Shown on the post-quiz offer page. Runs until
-- the 2026.2 sale closes (2 weeks before the 13/09 exam).
INSERT INTO coupons (code, discount_type, discount_value, applies_to_cohort_slugs, active, expires_at, notes)
SELECT 'RETA2026', 'fixed_cents', 70000, ARRAY['revalida-2026-2'], true,
       '2026-08-30 23:59:59-03', 'Reta final 2026.2 — R$700 off (offer page + early/mid drip)'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'RETA2026');

-- ULTIMA2026 — R$1.000 off → R$2.990. PRIVATE: delivered ONLY in the final-stretch
-- drip emails, never on a public surface. Active only the last ~2 weeks of the sale.
INSERT INTO coupons (code, discount_type, discount_value, applies_to_cohort_slugs, active, starts_at, expires_at, notes)
SELECT 'ULTIMA2026', 'fixed_cents', 100000, ARRAY['revalida-2026-2'], true,
       '2026-08-16 00:00:00-03', '2026-08-30 23:59:59-03',
       'Última chance 2026.2 — R$1.000 off (email-only, final stretch)'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'ULTIMA2026');
