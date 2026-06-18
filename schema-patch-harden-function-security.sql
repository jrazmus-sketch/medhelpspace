-- Clear the Supabase advisor WARNINGS on public functions (after the RLS fix).
-- Audited live with scratch/fn-audit.js + grep of every app .rpc() call site.
--
-- Two warning classes, handled per-function based on how the app actually calls each:
--
--  (1) function_search_path_mutable (7 fns) — pin search_path. Pure hardening,
--      no behavior change; matches the `SET search_path = public` already on the
--      other functions in this DB.
--
--  (2) anon/authenticated_security_definer_function_executable — split by call site:
--      - search_content, preview_coupon, redeem_coupon, decrement_coupon_counter,
--        get_last_activity_per_user: every call site is admin.rpc(...) (service_role),
--        so anon/authenticated never need EXECUTE. Revoking also stops an
--        unauthenticated caller from hitting /rest/v1/rpc/redeem_coupon etc. to
--        burn/enumerate coupons. handle_new_user is a trigger, never an RPC.
--      - current_user_role, user_has_active_membership, user_has_module_access are
--        LEFT executable on purpose: they are called inside RLS policies and by the
--        authenticated membership gate (app/src/lib/membership-gate.ts). Revoking
--        would break RLS evaluation. They only ever return the caller's own status
--        (they read auth.uid()), so direct RPC calls leak nothing. Their residual
--        advisor warnings are expected and can be dismissed in the dashboard.
--
-- Not covered here: auth_leaked_password_protection — that is a GoTrue/Auth setting
-- (Dashboard → Authentication → Sign In / Providers → enable leaked-password
-- protection), not a SQL change.
--
-- Run with: node scripts/run-sql.js schema-patch-harden-function-security.sql

-- ── (1) Pin search_path on the 7 mutable-search_path functions ───────────────

ALTER FUNCTION public.search_content(text, integer)        SET search_path = public;
ALTER FUNCTION public.set_updated_at()                     SET search_path = public;
ALTER FUNCTION public.sync_module_unlock_dates()           SET search_path = public;
ALTER FUNCTION public.sync_module_offset_dates()           SET search_path = public;
ALTER FUNCTION public.update_orders_updated_at()           SET search_path = public;
ALTER FUNCTION public.user_has_active_membership()         SET search_path = public;
ALTER FUNCTION public.user_has_module_access(smallint)     SET search_path = public;

-- ── (2) Lock down the server-only SECURITY DEFINER functions ─────────────────
-- Remove anon/authenticated/PUBLIC EXECUTE; keep service_role (the admin client).

REVOKE ALL ON FUNCTION public.search_content(text, integer)            FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_content(text, integer)        TO service_role;

REVOKE ALL ON FUNCTION public.preview_coupon(text, text, integer)      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.preview_coupon(text, text, integer)  TO service_role;

REVOKE ALL ON FUNCTION public.redeem_coupon(text, uuid, text, integer)     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.redeem_coupon(text, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.decrement_coupon_counter(bigint)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decrement_coupon_counter(bigint)    TO service_role;

REVOKE ALL ON FUNCTION public.get_last_activity_per_user(uuid[])      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_last_activity_per_user(uuid[])  TO service_role;

-- Trigger function (fires on auth.users INSERT) — never meant to be an RPC.
-- The trigger still runs (SECURITY DEFINER, owned by postgres); the inserting
-- role does not need EXECUTE for a trigger to fire.
REVOKE ALL ON FUNCTION public.handle_new_user()                       FROM PUBLIC, anon, authenticated;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- Re-grant (only if something actually depended on the old open grants):
--   GRANT EXECUTE ON FUNCTION public.search_content(text, integer)            TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.preview_coupon(text, text, integer)      TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, uuid, text, integer) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.decrement_coupon_counter(bigint)         TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_last_activity_per_user(uuid[])       TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.handle_new_user()                        TO anon, authenticated;
-- Unpin search_path:  ALTER FUNCTION ... RESET search_path;
