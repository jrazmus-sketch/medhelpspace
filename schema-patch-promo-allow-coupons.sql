-- Condição especial de lançamento — coupons are allowed again (Karina, via Justin, 2026-09-30).
--
-- Her original decision (21/09) closed coupons on Turma 2027.1 for the whole window so we would
-- never mail a code the checkout then refused. She has now reversed that: the codes stay active
-- and apply to 2027.1 as usual, on top of the promotional price.
--
-- Turning the flag off is the ONLY change needed — everything reads `blocks_coupons`:
--   · preview_coupon / redeem_coupon stop raising COUPON_BLOCKED_BY_PROMOTION for this turma;
--   · the charge route's own pre-check stops refusing a coupon;
--   · the checkout shows the coupon field again and drops the "cupons não se aplicam" line
--     (the launch-condition note itself stays — the rollover to 2027.2 is unchanged);
--   · the drip crons and reward pages start offering REVALIDA10 / VOLTA10 / FLASH5 again.
--     Held leads were never skipped: each resumes at its next cron run.
--
-- Effect on price: R$ 2.997 with a 10% code = R$ 2.697,30; with FLASH5 (5%) = R$ 2.847,15.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-promo-allow-coupons.sql                            # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-promo-allow-coupons.sql                          # local
--
-- Rollback (blocks coupons again):
--   UPDATE cohort_promotions SET blocks_coupons = true
--    WHERE slug = 'lancamento-2027-1-garantia-2027-2';

BEGIN;

UPDATE cohort_promotions
   SET blocks_coupons = false,
       notes = coalesce(notes, '') || ' | Cupons liberados na 2027.1 a partir de 30/09/2026 (Karina).'
 WHERE slug = 'lancamento-2027-1-garantia-2027-2'
   AND blocks_coupons;

COMMIT;
