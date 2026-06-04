-- Delete-member support + working session revocation.
-- Run with: node scripts/run-sql.js schema-patch-delete-member.sql
--
-- Two capabilities are enabled here:
--
-- 1. Hard-deleting an auth.users row (the "Delete member" admin action) without
--    a foreign-key violation, while PRESERVING financial + audit records by
--    anonymizing their user reference instead of deleting the rows.
--      - orders.user_id            NOT NULL  -> nullable, ON DELETE SET NULL
--      - admin_audit_log.actor_*   NOT NULL  -> nullable, ON DELETE SET NULL
--      - admin_audit_log.target_*            -> ON DELETE SET NULL
--      - coupons.created_by                  -> ON DELETE SET NULL
--    A customer_email snapshot is added to orders so anonymized rows still show
--    who they belonged to (the app stamps it before the user is deleted).
--
-- 2. admin_revoke_user_sessions(uuid): force-logout helper for the ⊘ button.
--    supabase-js auth.admin.signOut() only accepts a JWT, not a user id, so the
--    old code could never revoke another user's sessions. This SECURITY DEFINER
--    function deletes the target's rows from auth.sessions directly.
--
-- Idempotent: re-running drops and recreates the constraints/function.
-- run-sql.js wraps the whole file in a single transaction, so no BEGIN/COMMIT here.
-- Rollback notes at the bottom.

-- ── 1a. orders: preserve order history when the owner is deleted ───────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 1b. admin_audit_log: keep the trail when an actor/target is deleted ────────
ALTER TABLE public.admin_audit_log ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_actor_user_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_target_user_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_target_user_id_fkey
  FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 1c. coupons.created_by: keep coupons when their creator is deleted ─────────
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_created_by_fkey;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2. Session revocation helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = target_user;
END;
$$;

-- Service-role only (the admin client uses the service key). Block everyone else.
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid) TO service_role;

-- Tell PostgREST about the new RPC so the admin client can call it immediately.
NOTIFY pgrst, 'reload schema';

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.admin_revoke_user_sessions(uuid);
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS customer_email;
-- (Restoring the NOT NULL constraints + original ON DELETE behavior would
--  require backfilling any rows that were anonymized by a delete in the meantime,
--  so there is no automatic down-migration for the FK changes.)
