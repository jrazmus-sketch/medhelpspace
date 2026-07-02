-- PagBank: prevent duplicate pending credit-card orders for the same (user, cohort).
-- Without this, a network-timeout retry or a second tab/double-submit during card
-- checkout can insert two 'pending' orders and call PagBank /charges twice for the
-- same purchase, producing two real card charges. Mirrors
-- idx_orders_one_pending_pix_per_user_cohort (schema-patch-pagbank-pix-dedup.sql)
-- for the credit_card payment method.
--
-- Postgres partial indexes can't use NOW() in the predicate (not immutable), so
-- this guards ALL pending credit_card orders for a user+cohort. The application
-- (app/src/app/api/pagbank/charge/route.ts) is responsible for expiring stale
-- pending credit_card orders before inserting a new one — a pending card order
-- normally only exists for the few seconds of the PagBank /charges round-trip, so
-- anything older than ~15 minutes is treated as abandoned (e.g. a crash mid-charge)
-- and cancelled, so a stranded row never blocks a legitimate retry forever.
--
-- Run with: node scripts/run-sql.js schema-patch-card-order-dedup.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_pending_card_per_user_cohort
  ON orders (user_id, cohort_id)
  WHERE status = 'pending' AND payment_method = 'credit_card';

-- Rollback:
-- DROP INDEX IF EXISTS idx_orders_one_pending_card_per_user_cohort;
