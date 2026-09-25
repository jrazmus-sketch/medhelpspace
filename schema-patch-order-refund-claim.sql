-- Refund claim: one refund per order, even under a double click.
--
-- /api/admin/billing/refund read the order (status='paid'), called PagBank,
-- then wrote status='refunded'. Two concurrent requests both passed the read
-- and both asked PagBank to cancel the charge. The route now CLAIMS the order
-- first with a conditional UPDATE on this column — only one request can move
-- it from NULL — and releases the claim if PagBank refuses the refund.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-order-refund-claim.sql                     # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-order-refund-claim.sql                   # local
--
-- Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS refund_claimed_at;

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_claimed_at timestamptz;

COMMENT ON COLUMN orders.refund_claimed_at IS
  'Set atomically by the admin refund route before it calls PagBank; cleared if PagBank refuses. Guards against two concurrent refunds of one order.';

COMMIT;
