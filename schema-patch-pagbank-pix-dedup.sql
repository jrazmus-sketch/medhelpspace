-- PagBank: prevent duplicate pending Pix orders for the same (user, cohort).
-- Without this, a user clicking "Gerar QR code" twice (or refreshing) can produce
-- two valid QR codes for the same cohort and accidentally pay both.
--
-- Postgres partial indexes can't use NOW() in the predicate (not immutable), so
-- this guards ALL pending Pix orders for a user+cohort. The application is
-- responsible for cancelling expired pending Pix orders before inserting a new
-- one, so an expired row never blocks a fresh charge.
--
-- Run with: node scripts/run-sql.js schema-patch-pagbank-pix-dedup.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_one_pending_pix_per_user_cohort
  ON orders (user_id, cohort_id)
  WHERE status = 'pending' AND payment_method = 'pix';

-- Rollback:
-- DROP INDEX IF EXISTS idx_orders_one_pending_pix_per_user_cohort;
