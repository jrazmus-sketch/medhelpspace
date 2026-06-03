-- Coupon system: WooCommerce/PMPro parity for promo codes.
--
-- Scope (locked 2026-06-03):
--   - 1 use per person (hardcoded — UNIQUE(coupon_id, user_id))
--   - 100%-off codes allowed; charge route short-circuits PagBank for free orders
--   - Works for both Pix and credit card
--   - One code per order
--
-- Tables / RPCs:
--   coupons                 — admin-managed catalog of codes
--   coupon_redemptions      — one row per (user, coupon) when redeemed at checkout
--   preview_coupon()        — read-only validation (used by /api/coupons/validate)
--   redeem_coupon()         — atomic lock + insert + counter bump, called inside charge flow
--
-- The PostgreSQL UNIQUE constraint on coupon_redemptions(coupon_id, user_id) is the
-- real per-user enforcement. The RPCs raise typed errors that the route maps to
-- Portuguese strings.
--
-- Run with: node scripts/run-sql.js schema-patch-coupons.sql

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  -- percent: 1-100 (capped in CHECK); fixed_cents: any positive integer
  max_redemptions INTEGER,        -- NULL = unlimited
  redemptions_used INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  applies_to_cohort_slugs TEXT[], -- NULL = all cohorts
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coupons_percent_value_range'
  ) THEN
    ALTER TABLE coupons ADD CONSTRAINT coupons_percent_value_range
      CHECK (discount_type != 'percent' OR (discount_value BETWEEN 1 AND 100))
      NOT VALID;
  END IF;
END $$;
-- NOT VALID lets existing rows skip; new rows are still checked.

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_upper_uniq ON coupons (UPPER(code));

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  amount_discount_cents INTEGER NOT NULL CHECK (amount_discount_cents >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-use-per-person, enforced at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_user_coupon_uniq
  ON coupon_redemptions (coupon_id, user_id);

CREATE INDEX IF NOT EXISTS coupon_redemptions_order_idx
  ON coupon_redemptions (order_id) WHERE order_id IS NOT NULL;

-- ── Orders columns ──────────────────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id BIGINT REFERENCES coupons(id),
  ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0
    CHECK (discount_cents >= 0);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Admins (super_admin, billing_admin) manage coupons. Regular users never read
-- the catalog directly — the validate endpoint uses service_role.
DROP POLICY IF EXISTS coupons_admin_all ON coupons;
CREATE POLICY coupons_admin_all ON coupons
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

-- Users see their own redemption history; admins see all.
DROP POLICY IF EXISTS coupon_redemptions_select_own ON coupon_redemptions;
CREATE POLICY coupon_redemptions_select_own ON coupon_redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS coupon_redemptions_admin_all ON coupon_redemptions;
CREATE POLICY coupon_redemptions_admin_all ON coupon_redemptions
  FOR ALL TO authenticated
  USING (current_user_role() IN ('super_admin', 'billing_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'billing_admin'));

-- ── RPC: preview_coupon (read-only validation) ──────────────────────────────
-- Used by /api/coupons/validate. Does NOT lock or insert. Raises typed errors
-- the route maps to user-facing Portuguese messages.

CREATE OR REPLACE FUNCTION preview_coupon(
  p_code TEXT,
  p_cohort_slug TEXT,
  p_base_amount_cents INTEGER
) RETURNS TABLE (
  coupon_id BIGINT,
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
  v_discount_cents INTEGER;
  v_final_cents INTEGER;
BEGIN
  SELECT * INTO v_coupon FROM coupons WHERE UPPER(code) = UPPER(p_code);
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

  IF v_coupon.discount_type = 'percent' THEN
    v_discount_cents := (p_base_amount_cents * v_coupon.discount_value) / 100;
  ELSE
    v_discount_cents := LEAST(v_coupon.discount_value, p_base_amount_cents);
  END IF;
  v_final_cents := GREATEST(p_base_amount_cents - v_discount_cents, 0);

  RETURN QUERY SELECT
    v_coupon.id,
    v_discount_cents,
    v_final_cents,
    (v_final_cents = 0) AS is_full_discount;
END;
$$;

REVOKE ALL ON FUNCTION preview_coupon(TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_coupon(TEXT, TEXT, INTEGER) TO service_role;

-- ── RPC: redeem_coupon (atomic lock + insert + counter bump) ────────────────
-- Called inside the /api/pagbank/charge route. Locks the coupon row, inserts
-- the redemption (the UNIQUE constraint catches double-redemption from the same
-- user under concurrent requests), and bumps the counter. The caller links
-- order_id afterwards once the order row exists.

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

  IF v_coupon.discount_type = 'percent' THEN
    v_discount_cents := (p_base_amount_cents * v_coupon.discount_value) / 100;
  ELSE
    v_discount_cents := LEAST(v_coupon.discount_value, p_base_amount_cents);
  END IF;
  v_final_cents := GREATEST(p_base_amount_cents - v_discount_cents, 0);

  -- The UNIQUE(coupon_id, user_id) index raises unique_violation (23505) if the
  -- same user tries to redeem twice — the route catches it and returns a clean
  -- "Você já usou este cupom" message.
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

-- ── RPC: decrement_coupon_counter (used by charge route's rollback path) ────
-- When a downstream payment failure undoes a coupon redemption, the counter is
-- decremented so the user can retry with the same code. GREATEST(...,0) keeps
-- it from going negative if rollback races with a concurrent admin reset.

CREATE OR REPLACE FUNCTION decrement_coupon_counter(p_coupon_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE coupons
  SET redemptions_used = GREATEST(redemptions_used - 1, 0)
  WHERE id = p_coupon_id;
END;
$$;

REVOKE ALL ON FUNCTION decrement_coupon_counter(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decrement_coupon_counter(BIGINT) TO service_role;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS decrement_coupon_counter(BIGINT);
-- DROP FUNCTION IF EXISTS redeem_coupon(TEXT, UUID, TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS preview_coupon(TEXT, TEXT, INTEGER);
-- ALTER TABLE orders DROP COLUMN IF EXISTS discount_cents;
-- ALTER TABLE orders DROP COLUMN IF EXISTS coupon_id;
-- DROP TABLE IF EXISTS coupon_redemptions;
-- DROP TABLE IF EXISTS coupons;
