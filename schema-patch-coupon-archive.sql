-- Coupons: "Excluir" a coupon that has already been used (Karina, 2026-10-01).
--
-- A used coupon cannot be hard-deleted: orders.coupon_id points at it (no ON DELETE,
-- so the DELETE fails), and coupon_redemptions is ON DELETE CASCADE, so even if it
-- succeeded the record of who used it would vanish with it. Karina's goal is a clean
-- list, not a lost history, so a used coupon is ARCHIVED instead:
--
--   · coupons.archived_at — NULL = live; set = removed from /admin/coupons (shown only
--     under "Mostrar excluídos", where it can be restored). Orders, redemptions and the
--     ambassador ledger keep pointing at the row, so every past purchase still names
--     the code it used.
--   · coupons_archived_inactive — an archived coupon can never be active, so it can
--     never be redeemed: preview_coupon / redeem_coupon already refuse inactive codes
--     (COUPON_INACTIVE). Restoring brings it back INACTIVE; reactivating is a separate,
--     deliberate click.
--
-- An archived code still holds its name (coupons_code_upper_uniq), so creating the
-- same code again is refused — the admin route tells her to restore the archived one.
-- A coupon nobody used is still deleted for real, as before.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-coupon-archive.sql                            # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-coupon-archive.sql                          # local
--   then on local: NOTIFY pgrst, 'reload schema';

-- ── Column ──────────────────────────────────────────────────────────────────

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- ── An archived coupon is always inactive ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupons_archived_inactive'
  ) THEN
    ALTER TABLE coupons ADD CONSTRAINT coupons_archived_inactive
      CHECK (archived_at IS NULL OR active = false);
  END IF;
END $$;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_archived_inactive;
-- ALTER TABLE coupons DROP COLUMN IF EXISTS archived_at;
--   (archived coupons reappear in the list, still inactive)
