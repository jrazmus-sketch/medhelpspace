-- Welcome discount for 2027.1 leads — 10% off. Scoped to revalida-2027-1 only;
-- redeem_coupon()/preview_coupon() raise COUPON_NOT_VALID_FOR_COHORT on any other cohort.
-- Shown on the post-quiz offer page and re-sent in the D2 drip email.
-- No expiry — the 2027.1 window is long and not date-critical.
--
-- Idempotent (WHERE NOT EXISTS on UPPER(code)) — safe to re-run.
-- Run with: node scripts/run-sql.js seed-coupon-revalida10.sql

INSERT INTO coupons (code, discount_type, discount_value, applies_to_cohort_slugs, active, notes)
SELECT 'REVALIDA10', 'percent', 10, ARRAY['revalida-2027-1'], true,
       'Boas-vindas 2027.1 — 10% off (offer page + D2 drip email)'
WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE UPPER(code) = 'REVALIDA10');
