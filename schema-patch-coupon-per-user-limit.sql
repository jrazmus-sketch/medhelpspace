-- Coupon per-user redemption limit: make "1 use per person" configurable.
--
-- Before this patch the limit was hardcoded two ways:
--   - UNIQUE(coupon_id, user_id) on coupon_redemptions
--   - charge route mapping unique_violation (23505) to "Você já usou este cupom."
--
-- After this patch:
--   - coupons.max_uses_per_user INTEGER DEFAULT 1 — NULL = unlimited.
--     Existing rows backfill to 1, so current coupons behave exactly as before.
--   - The UNIQUE index is replaced by a plain index; redeem_coupon() now counts
--     the user's redemptions inside the FOR UPDATE coupon-row lock (concurrent
--     redemptions of the same coupon serialize on that lock, so the count is
--     race-safe) and raises COUPON_ALREADY_USED at the limit.
--   - The charge route maps COUPON_ALREADY_USED to the same Portuguese message.
--
-- Rationale: lets a testing coupon (e.g. fixed-amount code that drops the price
-- to R$ 1) be redeemed repeatedly by the same account for real-Pix end-to-end
-- tests, without loosening real promo codes.
--
-- Run with: node scripts/run-sql.js schema-patch-coupon-per-user-limit.sql

-- ── Column ──────────────────────────────────────────────────────────────────

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS max_uses_per_user INTEGER DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupons_max_uses_per_user_positive'
  ) THEN
    ALTER TABLE coupons ADD CONSTRAINT coupons_max_uses_per_user_positive
      CHECK (max_uses_per_user IS NULL OR max_uses_per_user > 0);
  END IF;
END $$;

-- ── Index swap ──────────────────────────────────────────────────────────────
-- The unique index was the old per-user enforcement; the plain replacement
-- keeps the (coupon_id, user_id) lookup in redeem_coupon fast.

DROP INDEX IF EXISTS coupon_redemptions_user_coupon_uniq;

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_user_idx
  ON coupon_redemptions (coupon_id, user_id);

-- ── RPC: redeem_coupon (now enforces max_uses_per_user) ─────────────────────
-- Same signature and behavior as before, plus the per-user count check. The
-- count only sees live redemption rows — the charge route's rollback path
-- deletes the row on payment failure, so failed attempts don't burn uses.

CREATE OR REPLACE FUNCTION redeem_coupon(
  p_code TEXT,
  p_user_id UUID,
  p_cohort_slug TEXT,
  p_base_amount_cents INTEGER
) RETURNS TABLE (
  coupon_id BIGINT,
  redemption_id BIGINT,
  discount_cents INTEGER,
  final_amount_cents INTEGER,
  is_full_discount BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon coupons%ROWTYPE;
  v_user_uses INTEGER;
  v_discount_cents INTEGER;
  v_final_cents INTEGER;
  v_redemption_id BIGINT;
BEGIN
  -- Lock the coupon row so concurrent redemptions serialize on it.
  SELECT * INTO v_coupon FROM coupons
  WHERE UPPER(code) = UPPER(p_code) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COUPON_NOT_FOUND'; END IF;
  IF NOT v_coupon.active THEN RAISE EXCEPTION 'COUPON_INACTIVE'; END IF;
  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now()
    THEN RAISE EXCEPTION 'COUPON_NOT_YET_VALID'; END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now()
    THEN RAISE EXCEPTION 'COUPON_EXPIRED'; END IF;
  IF v_coupon.max_redemptions IS NOT NULL
     AND v_coupon.redemptions_used >= v_coupon.max_redemptions
    THEN RAISE EXCEPTION 'COUPON_FULLY_REDEEMED'; END IF;
  IF v_coupon.applies_to_cohort_slugs IS NOT NULL
     AND NOT (p_cohort_slug = ANY(v_coupon.applies_to_cohort_slugs))
    THEN RAISE EXCEPTION 'COUPON_NOT_VALID_FOR_COHORT'; END IF;

  -- Per-user limit (NULL = unlimited). Table alias is required: the bare
  -- column name coupon_id is ambiguous with this function's OUT parameter.
  IF v_coupon.max_uses_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO v_user_uses FROM coupon_redemptions cr
    WHERE cr.coupon_id = v_coupon.id AND cr.user_id = p_user_id;
    IF v_user_uses >= v_coupon.max_uses_per_user
      THEN RAISE EXCEPTION 'COUPON_ALREADY_USED'; END IF;
  END IF;

  IF v_coupon.discount_type = 'percent' THEN
    v_discount_cents := (p_base_amount_cents * v_coupon.discount_value) / 100;
  ELSE
    v_discount_cents := LEAST(v_coupon.discount_value, p_base_amount_cents);
  END IF;
  v_final_cents := GREATEST(p_base_amount_cents - v_discount_cents, 0);

  INSERT INTO coupon_redemptions (coupon_id, user_id, amount_discount_cents)
  VALUES (v_coupon.id, p_user_id, v_discount_cents)
  RETURNING id INTO v_redemption_id;

  UPDATE coupons
  SET redemptions_used = redemptions_used + 1
  WHERE id = v_coupon.id;

  RETURN QUERY SELECT
    v_coupon.id,
    v_redemption_id,
    v_discount_cents,
    v_final_cents,
    (v_final_cents = 0) AS is_full_discount;
END;
$$;

REVOKE ALL ON FUNCTION redeem_coupon(TEXT, UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_coupon(TEXT, UUID, TEXT, INTEGER) TO service_role;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS coupon_redemptions_coupon_user_idx;
-- CREATE UNIQUE INDEX coupon_redemptions_user_coupon_uniq
--   ON coupon_redemptions (coupon_id, user_id);
--   (fails if any user has >1 redemption of the same coupon — delete extras first)
-- ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_max_uses_per_user_positive;
-- ALTER TABLE coupons DROP COLUMN IF EXISTS max_uses_per_user;
-- Restore the previous redeem_coupon body from schema-patch-coupons.sql.
