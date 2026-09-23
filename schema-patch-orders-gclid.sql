-- schema-patch-orders-gclid.sql
--
-- Google Ads attribution for DIRECT purchases (2026-09-23).
--
-- Until now a sale reached Google Ads only through the lead funnels: the gclid was
-- stored on `leads` when someone signed up on /questoes-revalida,
-- /flashcards-revalida or /simulado-revalida, and "Purchase" was exported from
-- leads.converted_at. The new Search campaign (Karina's generic high-intent
-- keywords) sends clicks STRAIGHT to the sales page — a visitor can click, buy,
-- and never become a lead, so the sale was invisible to Google.
--
-- Now: the proxy keeps the ad click id in a first-party cookie (mhs_gclid, 90 days
-- = Google's maximum click-to-conversion window) on ANY page; the charge route
-- freezes it onto the order it creates. The /admin/leads OCI export then reports
--   • "Checkout started" — every order carrying a gclid (time = created_at, value 0)
--   • "Purchase"         — every PAID order carrying a gclid (value = base price)
-- and stamps these markers so nothing is uploaded twice.
--
-- Idempotent. Apply to prod AND local. Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS gclid, DROP COLUMN IF EXISTS ad_click_at,
--     DROP COLUMN IF EXISTS oci_checkout_uploaded_at, DROP COLUMN IF EXISTS oci_purchase_uploaded_at;

BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS gclid                    text,
  ADD COLUMN IF NOT EXISTS ad_click_at              timestamptz,
  ADD COLUMN IF NOT EXISTS oci_checkout_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS oci_purchase_uploaded_at timestamptz;

-- Shape guard. NOT a regex quantifier like {10,512}: Postgres caps regex
-- repetition counts at 255, so that version failed on EVERY insert carrying a
-- gclid ("invalid repetition count") — it would have broken checkout for every
-- buyer arriving from an ad. Length is checked separately.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_gclid_shape;
ALTER TABLE orders ADD CONSTRAINT orders_gclid_shape
  CHECK (gclid IS NULL OR (length(gclid) BETWEEN 10 AND 512 AND gclid ~ '^[A-Za-z0-9_-]+$'));

COMMENT ON COLUMN orders.gclid IS
  'Google Ads click id from the mhs_gclid cookie at checkout (last click, 90-day window). Frozen at order creation.';
COMMENT ON COLUMN orders.ad_click_at IS 'When that ad click landed on the site.';

CREATE INDEX IF NOT EXISTS orders_gclid_idx ON orders (created_at) WHERE gclid IS NOT NULL;

COMMIT;
