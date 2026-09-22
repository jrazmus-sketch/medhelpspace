-- Condição especial de lançamento — extended to Sunday 11/10/2026 (Karina, 2026-09-22).
--
-- Her reason: advertising only starts the night of 22/09 or on 23/09, and this is
-- MedHelpSpace's first launch, so the campaign needs the extra week. The extension
-- happens BEFORE any promotion ran publicly, which is why it is not the "promotion
-- that keeps getting extended" pattern warned about in the original thread.
--
-- ends_at is EXCLUSIVE: the last valid day 11/10 BRT ends at 12/10 00:00 BRT.
-- Everything reads ends_at — the banner's "Válido até", the checkout note, the
-- coupon block in preview_coupon/redeem_coupon, and the drip-email coupon pause —
-- so nothing else changes.
--
-- Guarded on the current value, so re-running it is a no-op.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-promo-extend-2026-10-11.sql      # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-promo-extend-2026-10-11.sql    # local
--
-- Rollback:
--   UPDATE cohort_promotions SET ends_at = '2026-10-06 00:00:00-03'
--    WHERE slug = 'lancamento-2027-1-garantia-2027-2';

BEGIN;

UPDATE cohort_promotions
   SET ends_at = '2026-10-12 00:00:00-03',
       notes   = coalesce(notes, '') || ' | Prorrogada até 11/10/2026 (Karina, 22/09/2026, antes do início dos anúncios).'
 WHERE slug = 'lancamento-2027-1-garantia-2027-2'
   AND ends_at = '2026-10-06 00:00:00-03';

COMMIT;
