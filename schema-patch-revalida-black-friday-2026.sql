-- schema-patch-revalida-black-friday-2026.sql — Black Friday 2026 on the Revalida turmas
-- (Karina 2026-11-02, "Black Friday 2026 — Atualização dos preços…").
--
--   Revalida 2027.1  R$ 2.997,00 → R$ 1.498,50   (50%)
--   Revalida 2027.2  R$ 3.997,00 → R$ 1.998,50   (50%)
--   02/11/2026 00:00 → 30/11/2026 23:59 (Brasília). Ends on its own: from 01/12 00:00 the
--   storefront, the checkout and the charge are back at the normal price, and the badge,
--   the "50% OFF" and the struck price disappear — no one has to touch anything.
--
-- Needs schema-patch-cohort-sale-window.sql AND the code that reads the window (apply
-- this AFTER that deploy — older code would show the sale with no end date).
-- Coupons: every coupon is "não combinável" by default, so none applies on top of this
-- price until an admin unticks "Não combinar com outras ofertas ativas" in /admin/coupons.
--
--   node scripts/run-sql.js schema-patch-revalida-black-friday-2026.sql                          # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-revalida-black-friday-2026.sql                        # local
--
-- End early / undo:
--   UPDATE cohorts SET sale_price_cents = NULL, sale_price_starts_at = NULL,
--     sale_price_ends_at = NULL, sale_badge_label = NULL
--    WHERE slug IN ('revalida-2027-1', 'revalida-20272');

BEGIN;

UPDATE cohorts
   SET sale_price_cents     = 149850,
       sale_price_starts_at = '2026-11-02T03:00:00Z',  -- 02/11/2026 00:00 BRT
       sale_price_ends_at   = '2026-12-01T03:00:00Z',  -- 01/12/2026 00:00 BRT (exclusive)
       sale_badge_label     = 'BLACK FRIDAY'
 WHERE slug = 'revalida-2027-1' AND price_cents = 299700;

UPDATE cohorts
   SET sale_price_cents     = 199850,
       sale_price_starts_at = '2026-11-02T03:00:00Z',
       sale_price_ends_at   = '2026-12-01T03:00:00Z',
       sale_badge_label     = 'BLACK FRIDAY'
 WHERE slug = 'revalida-20272' AND price_cents = 399700;

DO $$
BEGIN
  IF (SELECT count(*) FROM cohorts
       WHERE slug IN ('revalida-2027-1', 'revalida-20272')
         AND sale_badge_label = 'BLACK FRIDAY' AND sale_price_cents * 2 = price_cents) <> 2 THEN
    RAISE EXCEPTION 'Black Friday: expected both turmas at exactly 50%% — base price changed? Nothing applied.';
  END IF;
END $$;

COMMIT;
