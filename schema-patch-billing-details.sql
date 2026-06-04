-- Billing / tax details for Brazilian nota fiscal (NFe) compliance.
--
-- The old WooCommerce checkout ("Extra Checkout Fields for Brazil") collected the
-- full buyer identity required by Brazilian tax law. The new checkout must capture
-- the same set. We store it two ways:
--   1. orders.billing_*  — an immutable per-purchase SNAPSHOT (what the buyer gave
--      at the moment of sale; the correct basis for an invoice / audit trail).
--   2. profiles.billing_* — the latest values, used only to PREFILL the form for
--      returning buyers. Overwritten on each purchase.
--
-- Also adds orders.pagbank_order_id: Pix now goes through PagBank's Orders API
-- (POST /orders) which returns an ORDE_ id, distinct from the CHAR_ charge id used
-- by credit card. Webhook + status polling look orders up by this column for Pix.
--
-- Run with: node scripts/run-sql.js schema-patch-billing-details.sql

-- 1. Per-order billing snapshot ------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_first_name   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_last_name    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_cpf          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_cep          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address      TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_number       TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_neighborhood TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_city         TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_state        TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_phone        TEXT;

-- Pix Orders-API id (ORDE_…). Credit card keeps using pagbank_charge_id (CHAR_…).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pagbank_order_id     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_pagbank_order_id_key'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_pagbank_order_id_key UNIQUE (pagbank_order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_pagbank_order_id ON orders(pagbank_order_id);

-- 2. Profile cache (prefill only) ----------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_first_name   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_last_name    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cpf          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_cep          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_address      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_number       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_neighborhood TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_city         TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_state        TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS billing_phone        TEXT;

-- Rollback:
-- DROP INDEX IF EXISTS idx_orders_pagbank_order_id;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pagbank_order_id_key;
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS billing_first_name, DROP COLUMN IF EXISTS billing_last_name,
--   DROP COLUMN IF EXISTS billing_cpf, DROP COLUMN IF EXISTS billing_cep,
--   DROP COLUMN IF EXISTS billing_address, DROP COLUMN IF EXISTS billing_number,
--   DROP COLUMN IF EXISTS billing_neighborhood, DROP COLUMN IF EXISTS billing_city,
--   DROP COLUMN IF EXISTS billing_state, DROP COLUMN IF EXISTS billing_phone,
--   DROP COLUMN IF EXISTS pagbank_order_id;
-- ALTER TABLE profiles
--   DROP COLUMN IF EXISTS billing_first_name, DROP COLUMN IF EXISTS billing_last_name,
--   DROP COLUMN IF EXISTS billing_cpf, DROP COLUMN IF EXISTS billing_cep,
--   DROP COLUMN IF EXISTS billing_address, DROP COLUMN IF EXISTS billing_number,
--   DROP COLUMN IF EXISTS billing_neighborhood, DROP COLUMN IF EXISTS billing_city,
--   DROP COLUMN IF EXISTS billing_state, DROP COLUMN IF EXISTS billing_phone;
