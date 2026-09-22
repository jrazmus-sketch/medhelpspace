-- Cohort promotions — "Condição especial de lançamento" (Karina 2026-09-21).
--
-- A promotion attaches a BONUS to an ordinary turma purchase: whoever buys the
-- promo turma (2027.1) while the window is open pays that turma's normal price,
-- through the normal checkout, and is later moved onto a second turma (2027.2)
-- automatically — "sua preparação garantida até o Revalida 2027.2".
--
-- Why a move and not a second membership: the whole app assumes ONE active
-- membership per user (getCurrentUserCohort / get60dAccess take the first active
-- row with no ordering; the lifecycle cron would double-send; refunds delete by
-- order.cohort_id). Both 2027 turmas are open at once, so granting both would make
-- the dashboard, the 60D countdown and the study plan pick a turma at random. The
-- buyer therefore holds exactly one row, and apply_promotion_rollovers() moves it
-- (cohort_id 2027.1 → 2027.2, joined_at preserved) just before 2027.1 closes.
--
-- The promo is stamped on the ORDER at charge time (orders.promotion_id), not
-- derived from the payment date: a Pix generated on the last evening and paid after
-- midnight still gets what the buyer was shown. finalizePaidOrder copies it onto
-- the membership in the same upsert that grants access, so the flag can never be
-- lost separately from the grant.
--
-- Coupons: while a blocking promotion is open, NO coupon applies to its turma
-- (Karina's decision 3 — REVALIDA10 / VOLTA10 / FLASH5). Enforced here, inside
-- preview_coupon and redeem_coupon, so the validate route, the installments ladder
-- and the charge all refuse it without each re-implementing the rule. The app
-- checks too (defense in depth) and says why in Portuguese.
--
-- Window: 22/09/2026 00:00 → 05/10/2026 23:59:59 in Brasília. ends_at is
-- EXCLUSIVE (06/10 00:00 BRT). Brazil has had no DST since 2019, so -03 is exact.
--
-- Run with:
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-cohort-promotions.sql    # local
--   node scripts/run-sql.js schema-patch-cohort-promotions.sql      # prod
-- then, locally: NOTIFY pgrst, 'reload schema';
--
-- Rollback (manual, in this order — the coupon functions must go back first):
--   1. Re-run the preview_coupon / redeem_coupon bodies from
--      schema-patch-coupon-per-user-limit.sql (identical minus the promotion check).
--   2. DROP FUNCTION IF EXISTS apply_promotion_rollovers(uuid, interval);
--      DROP FUNCTION IF EXISTS cohort_coupons_blocked(text);
--   3. Only if NO membership has been moved yet (rolled_over_at IS NULL everywhere) —
--      otherwise the moved rows would lose their provenance:
--      ALTER TABLE user_cohort_memberships
--        DROP COLUMN IF EXISTS promotion_id, DROP COLUMN IF EXISTS rollover_to_cohort_id,
--        DROP COLUMN IF EXISTS rolled_over_from_cohort_id, DROP COLUMN IF EXISTS rolled_over_at;
--      ALTER TABLE orders DROP COLUMN IF EXISTS promotion_id;
--      DROP TABLE IF EXISTS cohort_promotions;
--   To just END a promotion early, don't roll back: UPDATE cohort_promotions SET active = false.
--   Buyers already flagged keep their rollover (they were sold it).

BEGIN;

-- ── 1. The promotion itself ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cohort_promotions (
  id                     smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                   text        NOT NULL UNIQUE,
  cohort_id              smallint    NOT NULL REFERENCES cohorts(id),
  rollover_to_cohort_id  smallint    NOT NULL REFERENCES cohorts(id),
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  blocks_coupons         boolean     NOT NULL DEFAULT true,
  active                 boolean     NOT NULL DEFAULT true,
  notes                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_promotions_window   CHECK (ends_at > starts_at),
  CONSTRAINT cohort_promotions_distinct CHECK (cohort_id <> rollover_to_cohort_id)
);

COMMENT ON TABLE cohort_promotions IS
  'Time-boxed bonus on a turma purchase: buyers of cohort_id inside [starts_at, ends_at) are moved to rollover_to_cohort_id when cohort_id closes. Read server-side only (service role).';
COMMENT ON COLUMN cohort_promotions.ends_at IS 'EXCLUSIVE upper bound.';
COMMENT ON COLUMN cohort_promotions.blocks_coupons IS
  'While the window is open, preview_coupon/redeem_coupon refuse every code on cohort_id (COUPON_BLOCKED_BY_PROMOTION).';

-- Storefront config, read only through the service-role client (like cohorts'
-- commerce columns). RLS on with no policies = no anon/authenticated access at all.
ALTER TABLE cohort_promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cohort_promotions FROM anon, authenticated;

-- ── 2. Stamp on the order (frozen at charge time) ────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promotion_id smallint REFERENCES cohort_promotions(id);

COMMENT ON COLUMN orders.promotion_id IS
  'Promotion open when this order was CREATED. Frozen — a Pix paid after the window closes still honours it.';

-- ── 3. Carry it on the membership ────────────────────────────────────────────
-- rollover_to_cohort_id / rolled_over_from_cohort_id deliberately have NO foreign
-- key to cohorts. PostgREST resolves every `cohort:cohorts(*)` embed from this
-- table by FK; a second (or third) FK to cohorts makes all of them ambiguous
-- (PGRST201) and the dashboard, study plan, 60D gate and lifecycle cron silently
-- get nothing back. Found on local before prod. Integrity still holds: the target
-- is only ever copied from cohort_promotions.rollover_to_cohort_id (FK-checked),
-- and the source is the row's own cohort_id at the moment of the move.
ALTER TABLE user_cohort_memberships
  ADD COLUMN IF NOT EXISTS promotion_id               smallint REFERENCES cohort_promotions(id),
  ADD COLUMN IF NOT EXISTS rollover_to_cohort_id      smallint,
  ADD COLUMN IF NOT EXISTS rolled_over_from_cohort_id smallint,
  ADD COLUMN IF NOT EXISTS rolled_over_at             timestamptz;

-- An earlier local draft of this patch created those two FKs; drop them if present.
ALTER TABLE user_cohort_memberships
  DROP CONSTRAINT IF EXISTS user_cohort_memberships_rollover_to_cohort_id_fkey,
  DROP CONSTRAINT IF EXISTS user_cohort_memberships_rolled_over_from_cohort_id_fkey;

DO $$ BEGIN
  ALTER TABLE user_cohort_memberships
    ADD CONSTRAINT ucm_rollover_differs CHECK (rollover_to_cohort_id IS NULL OR rollover_to_cohort_id <> cohort_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN user_cohort_memberships.rollover_to_cohort_id IS
  'Pending move: when cohort_id closes, apply_promotion_rollovers() moves this row to this turma. NULL once moved.';
COMMENT ON COLUMN user_cohort_memberships.rolled_over_from_cohort_id IS
  'Set by the move — the turma this row was on before. Drives the "próximo MedHelp 60D" notice.';

CREATE INDEX IF NOT EXISTS ucm_pending_rollover_idx
  ON user_cohort_memberships (cohort_id)
  WHERE rollover_to_cohort_id IS NOT NULL;

-- ── 4. Is a coupon-blocking promotion open for this turma right now? ─────────
CREATE OR REPLACE FUNCTION cohort_coupons_blocked(p_cohort_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cohort_promotions p
    JOIN cohorts c ON c.id = p.cohort_id
    WHERE c.slug = p_cohort_slug
      AND p.active
      AND p.blocks_coupons
      AND now() >= p.starts_at
      AND now() <  p.ends_at
  )
$$;

REVOKE EXECUTE ON FUNCTION cohort_coupons_blocked(text) FROM PUBLIC, anon, authenticated;

-- ── 5. Coupon RPCs — same bodies as prod, plus the promotion check FIRST ─────
-- First, so any code typed on the promo turma gets the one message that explains
-- why ("não se aplica durante a condição especial"), not "cupom não encontrado".
-- CREATE OR REPLACE keeps the existing grants (postgres + service_role only).
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

-- ── 6. The move ───────────────────────────────────────────────────────────────
-- Moves every pending row whose turma closes within p_lookahead. Called by the
-- daily cron (/api/cron/promotion-rollovers, 23:00 UTC = 20:00 BRT) with the
-- default 1 day, and by requireActiveMembership for ONE user as a fallback if a
-- cron run was missed — so a promo buyer can never land on /loja between turmas.
-- 2027.1 closes 2027-06-04 00:00 UTC (21:00 BRT on 03/06): the 23:00 UTC run on
-- 03/06 moves them one hour before, so access never lapses.
--
-- The row is UPDATED in place (joined_at kept — lifecycle emails key on it). If the
-- buyer already holds the target turma (bought it separately) there is nothing to
-- move: the pending flag is cleared and both rows stay as they were.
-- OUT columns are prefixed so they can't collide with table columns in plpgsql.
CREATE OR REPLACE FUNCTION apply_promotion_rollovers(
  p_user_id   uuid     DEFAULT NULL,
  p_lookahead interval DEFAULT interval '1 day'
)
RETURNS TABLE(out_user_id uuid, out_from_cohort_id smallint, out_to_cohort_id smallint, out_result text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT m.user_id AS uid, m.cohort_id AS from_id, m.rollover_to_cohort_id AS to_id
    FROM user_cohort_memberships m
    JOIN cohorts c ON c.id = m.cohort_id
    WHERE m.rollover_to_cohort_id IS NOT NULL
      AND c.membership_ends_at <= now() + p_lookahead
      AND (p_user_id IS NULL OR m.user_id = p_user_id)
    FOR UPDATE OF m SKIP LOCKED
  LOOP
    IF EXISTS (
      SELECT 1 FROM user_cohort_memberships x
      WHERE x.user_id = r.uid AND x.cohort_id = r.to_id
    ) THEN
      UPDATE user_cohort_memberships
         SET rollover_to_cohort_id = NULL
       WHERE user_id = r.uid AND cohort_id = r.from_id;
      out_result := 'already_member';
    ELSE
      UPDATE user_cohort_memberships
         SET cohort_id                  = r.to_id,
             rollover_to_cohort_id      = NULL,
             rolled_over_from_cohort_id = r.from_id,
             rolled_over_at             = now()
       WHERE user_id = r.uid AND cohort_id = r.from_id;
      out_result := 'moved';
    END IF;
    out_user_id := r.uid;
    out_from_cohort_id := r.from_id;
    out_to_cohort_id := r.to_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_promotion_rollovers(uuid, interval) FROM PUBLIC, anon, authenticated;

-- ── 7. Karina's promotion ─────────────────────────────────────────────────────
-- Guarded on both turmas existing (a dev DB may lack one) and idempotent by slug.
INSERT INTO cohort_promotions (slug, cohort_id, rollover_to_cohort_id, starts_at, ends_at, blocks_coupons, notes)
SELECT 'lancamento-2027-1-garantia-2027-2', src.id, dst.id,
       '2026-09-22 00:00:00-03', '2026-10-06 00:00:00-03', true,
       'Condição especial de lançamento (Karina, 21/09/2026): Turma 2027.1 por R$ 2.997 com acesso prorrogado automaticamente até a 2027.2. Sem cupons na 2027.1 durante a condição.'
FROM cohorts src, cohorts dst
WHERE src.slug = 'revalida-2027-1' AND dst.slug = 'revalida-20272'
ON CONFLICT (slug) DO NOTHING;

COMMIT;
