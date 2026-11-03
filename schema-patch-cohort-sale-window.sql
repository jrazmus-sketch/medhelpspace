-- schema-patch-cohort-sale-window.sql — dated promotional prices + per-coupon "combinable"
-- (Karina 2026-11-02, Black Friday Revalida; Justin: a per-coupon toggle, not a global rule).
--
-- 1. cohorts.sale_price_starts_at / sale_price_ends_at — the promotional price
--    (cohorts.sale_price_cents, schema-patch-cohort-sale-price.sql) is only in force inside
--    [starts, ends). NULL on either side = open on that side, so a sale set before this patch
--    keeps working exactly as it did (manual on/off). ends is EXCLUSIVE: Black Friday ending
--    "30/11 às 23h59" is stored as 2026-12-01 00:00 BRT = 2026-12-01T03:00:00Z.
--    NOT cohorts.sale_ends_at — that one closes the whole turma to new sales.
--    cohorts.sale_badge_label — the campaign name shown on the price ("BLACK FRIDAY").
--
-- 2. coupons.combinable_with_offers — false (default, every existing coupon) = the coupon is
--    refused while the turma's promotional price is active; the admin switch
--    "Não combinar com outras ofertas ativas" is its negation. Enforced HERE, in
--    preview_coupon / redeem_coupon (COUPON_NOT_COMBINABLE), so no route can bypass it.
--
-- 3. cohort_sale_price_active(slug) — the one definition of "promotional price active now",
--    mirrored by lib/cohort-sale.ts for the storefront (keep the two in step).
--
-- Safe to apply before the code that reads it: with no sale window set, nothing changes.
-- The Black Friday values themselves are in schema-patch-revalida-black-friday-2026.sql.
--
--   node scripts/run-sql.js schema-patch-cohort-sale-window.sql                               # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-cohort-sale-window.sql                             # local
--
-- Rollback: re-run the preview_coupon / redeem_coupon bodies from schema-patch-cohort-promotions.sql
-- (+ the per-user check of schema-patch-coupon-per-user-limit.sql), then
--   DROP FUNCTION IF EXISTS cohort_sale_price_active(text);
--   ALTER TABLE coupons DROP COLUMN IF EXISTS combinable_with_offers;
--   ALTER TABLE cohorts DROP CONSTRAINT IF EXISTS cohorts_sale_window_order,
--     DROP CONSTRAINT IF EXISTS cohorts_sale_badge_label_len,
--     DROP COLUMN IF EXISTS sale_price_starts_at, DROP COLUMN IF EXISTS sale_price_ends_at,
--     DROP COLUMN IF EXISTS sale_badge_label;

BEGIN;

ALTER TABLE cohorts
  ADD COLUMN IF NOT EXISTS sale_price_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS sale_price_ends_at   timestamptz,
  ADD COLUMN IF NOT EXISTS sale_badge_label     text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cohorts_sale_window_order') THEN
    ALTER TABLE cohorts ADD CONSTRAINT cohorts_sale_window_order
      CHECK (sale_price_starts_at IS NULL OR sale_price_ends_at IS NULL OR sale_price_starts_at < sale_price_ends_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cohorts_sale_badge_label_len') THEN
    ALTER TABLE cohorts ADD CONSTRAINT cohorts_sale_badge_label_len
      CHECK (sale_badge_label IS NULL OR char_length(sale_badge_label) BETWEEN 1 AND 40);
  END IF;
END $$;

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS combinable_with_offers boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.cohort_sale_price_active(p_cohort_slug text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM cohorts c
    WHERE c.slug = p_cohort_slug
      AND c.sale_price_cents IS NOT NULL
      AND c.price_cents IS NOT NULL
      AND c.sale_price_cents >= 0
      AND c.sale_price_cents < c.price_cents
      AND (c.sale_price_starts_at IS NULL OR now() >= c.sale_price_starts_at)
      AND (c.sale_price_ends_at   IS NULL OR now() <  c.sale_price_ends_at)
  )
$function$;

-- Server-only helper (called from the SECURITY DEFINER coupon functions). Supabase grants
-- new functions to anon/authenticated by default — take that back.
REVOKE ALL ON FUNCTION public.cohort_sale_price_active(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cohort_sale_price_active(text) TO service_role;

-- preview_coupon / redeem_coupon: the live bodies (2026-11-02) + one rule, after the turma
-- check: a coupon not marked combinable is refused while the turma's promotional price is on.
CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_cohort_slug text, p_base_amount_cents integer)
 RETURNS TABLE(coupon_id bigint, discount_cents integer, final_amount_cents integer, is_full_discount boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon coupons%ROWTYPE;
  v_discount_cents INTEGER;
  v_final_cents INTEGER;
BEGIN
  IF cohort_coupons_blocked(p_cohort_slug) THEN RAISE EXCEPTION 'COUPON_BLOCKED_BY_PROMOTION'; END IF;

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
  IF NOT v_coupon.combinable_with_offers AND cohort_sale_price_active(p_cohort_slug)
    THEN RAISE EXCEPTION 'COUPON_NOT_COMBINABLE'; END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text, p_user_id uuid, p_cohort_slug text, p_base_amount_cents integer)
 RETURNS TABLE(coupon_id bigint, redemption_id bigint, discount_cents integer, final_amount_cents integer, is_full_discount boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon coupons%ROWTYPE;
  v_user_uses INTEGER;
  v_discount_cents INTEGER;
  v_final_cents INTEGER;
  v_redemption_id BIGINT;
BEGIN
  IF cohort_coupons_blocked(p_cohort_slug) THEN RAISE EXCEPTION 'COUPON_BLOCKED_BY_PROMOTION'; END IF;

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
  IF NOT v_coupon.combinable_with_offers AND cohort_sale_price_active(p_cohort_slug)
    THEN RAISE EXCEPTION 'COUPON_NOT_COMBINABLE'; END IF;

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
$function$;

COMMIT;
