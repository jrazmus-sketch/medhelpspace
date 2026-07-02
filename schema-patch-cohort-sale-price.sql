-- Cohort promotional (sale) price: a manual, on/off discount on top of the
-- catalog base price (price_cents from schema-patch-cohort-catalog.sql).
--
-- Model (locked 2026-07-02):
--   - sale_price_cents NULL           → no sale; the base price_cents is charged/shown.
--   - sale_price_cents = N (< base)   → SALE ON; N becomes the effective price
--     everywhere the cohort price appears (landing card, loja card, checkout,
--     the PagBank charge, coupon base, installment ladder). The base price_cents
--     is shown struck through, with a savings badge.
--   Turn a sale off by clearing the field. No auto-expiry column — this is a
--   manual toggle (distinct from sale_ends_at, which closes the whole cohort to
--   new purchases, not just the discount).
--
-- The effective price is derived in the query layer (lib/queries/cohort-products.ts),
-- so the entire payment path picks up the sale price with no logic change — it
-- already charges product.priceCents.
--
-- No RLS changes: storefront reads go through the service-role admin client, and
-- price/sale mutations are gated to super_admin + billing_admin at the app layer
-- (matches the cohort-catalog + coupons convention).
--
-- Run with: node scripts/run-sql.js schema-patch-cohort-sale-price.sql

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS sale_price_cents integer;  -- NULL = no sale; else the discounted price (< price_cents)

-- ── Constraint: a sale price must be non-negative and strictly below the base ──
-- Guards against a "discount" that's actually a markup, and against setting a
-- sale price on a cohort with no base price. NULL is always allowed (no sale).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cohorts_sale_price_below_base'
  ) THEN
    ALTER TABLE cohorts ADD CONSTRAINT cohorts_sale_price_below_base
      CHECK (
        sale_price_cents IS NULL
        OR (sale_price_cents >= 0 AND price_cents IS NOT NULL AND sale_price_cents < price_cents)
      );
  END IF;
END $$;

-- ── Rollback (manual) ─────────────────────────────────────────────────────────
-- ALTER TABLE cohorts DROP CONSTRAINT IF EXISTS cohorts_sale_price_below_base;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS sale_price_cents;
