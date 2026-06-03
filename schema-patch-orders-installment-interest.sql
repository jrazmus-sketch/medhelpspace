-- PagBank: record the installment interest breakdown on orders.
--
-- For credit-card installments > 1, the buyer pays PagBank's financing interest
-- (parcelamento com juros do comprador). The charge route re-simulates the live
-- ladder via /charges/fees/calculate and charges the interest-inclusive total, so:
--
--   amount_cents      = the amount actually charged to the card (interest-inclusive)
--   base_amount_cents = the cohort product price before interest
--   interest_cents    = amount_cents - base_amount_cents (0 for PIX / 1x à vista)
--
-- Existing rows predate buyer-paid interest, so base = amount and interest = 0.
--
-- Run with: node scripts/run-sql.js schema-patch-orders-installment-interest.sql

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS base_amount_cents integer,
  ADD COLUMN IF NOT EXISTS interest_cents integer NOT NULL DEFAULT 0;

-- Backfill historical rows: they were charged the flat price with no buyer interest.
UPDATE orders
  SET base_amount_cents = amount_cents
  WHERE base_amount_cents IS NULL;

-- Now that every row has a base, enforce presence going forward.
ALTER TABLE orders
  ALTER COLUMN base_amount_cents SET NOT NULL;

-- Rollback:
-- ALTER TABLE orders DROP COLUMN IF EXISTS base_amount_cents;
-- ALTER TABLE orders DROP COLUMN IF EXISTS interest_cents;
