-- Cohort catalog: make the cohorts table the single source of truth for the
-- saleable product (price + storefront visibility), replacing the hardcoded
-- COHORT_PRODUCTS in lib/pricing.ts and the cohort arrays in the landing
-- (pricing-cta.tsx) and loja (loja/page.tsx).
--
-- Scope (locked 2026-06-03) — step 1 of the cohort-as-product-catalog plan:
--   - Adds commerce columns to cohorts; backfills the two existing cohorts.
--   - No RLS changes here. Public-read policies arrive in a later step when the
--     landing/loja pages are rewired to read cohorts from the DB.
--   - Price/sale mutations will be gated to super_admin + billing_admin at the
--     app layer (matches the coupons patch convention).
--
-- Two independent lifecycle axes (do NOT conflate):
--   active      — already exists; the cohort is a live entity (members can study,
--                 content gating / 60D unlocks work).
--   is_for_sale — NEW; the cohort appears on landing/loja and accepts new
--                 purchases. A cohort can be active=true, is_for_sale=false
--                 (enrollment closed, existing students keep access).
--
-- A cohort is purchasable when:
--   active AND is_for_sale AND (sale_ends_at IS NULL OR sale_ends_at > now())
--
-- Run with: node scripts/run-sql.js schema-patch-cohort-catalog.sql

-- ── Columns ───────────────────────────────────────────────────────────────────

ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS price_cents    integer,                            -- authoritative base price; charge route reads this
  ADD COLUMN IF NOT EXISTS is_for_sale    boolean     NOT NULL DEFAULT false, -- show on landing/loja + accept checkout
  ADD COLUMN IF NOT EXISTS sale_label     text,                               -- optional store badge, e.g. "Mais tempo de preparação"
  ADD COLUMN IF NOT EXISTS display_order  smallint    NOT NULL DEFAULT 0,     -- card ordering on landing/loja
  ADD COLUMN IF NOT EXISTS sale_ends_at   timestamptz;                        -- optional auto-close; sale ends when now() passes this

-- ── Backfill existing cohorts ─────────────────────────────────────────────────
-- Prices from lib/pricing.ts (R$ 3.990 / R$ 4.990); sale_label from the current
-- hardcoded loja card. Matched by slug so this is safe to re-run.

UPDATE cohorts
  SET price_cents = 399000, is_for_sale = true, display_order = 1, sale_label = NULL
  WHERE slug = 'revalida-2026-2';

UPDATE cohorts
  SET price_cents = 499000, is_for_sale = true, display_order = 2, sale_label = 'Mais tempo de preparação'
  WHERE slug = 'revalida-2027-1';

-- ── Constraint: cannot be for sale without a price ────────────────────────────
-- Added after backfill so the two saleable cohorts already have prices. New
-- cohorts default is_for_sale=false, so they satisfy this until a price is set.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cohorts_for_sale_needs_price'
  ) THEN
    ALTER TABLE cohorts ADD CONSTRAINT cohorts_for_sale_needs_price
      CHECK (NOT is_for_sale OR price_cents IS NOT NULL);
  END IF;
END $$;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- ALTER TABLE cohorts DROP CONSTRAINT IF EXISTS cohorts_for_sale_needs_price;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS sale_ends_at;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS display_order;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS sale_label;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS is_for_sale;
-- ALTER TABLE cohorts DROP COLUMN IF EXISTS price_cents;
