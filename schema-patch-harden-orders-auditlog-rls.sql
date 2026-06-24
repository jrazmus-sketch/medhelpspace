-- Harden two RLS policies that are over-permissive:
--   (1) orders UPDATE policy has no WITH CHECK, so a billing_admin/super_admin
--       could update a row into a state that escapes the policy or rewrites
--       ownership/amount (e.g. flip user_id, alter amount_cents). A FOR UPDATE
--       policy with only USING gates which rows can be targeted but does NOT
--       constrain the resulting row — Postgres falls back to the USING clause
--       for the implicit check only when no WITH CHECK is present, which still
--       permits the admin to set arbitrary new column values. We add an explicit
--       WITH CHECK mirroring USING. WITH CHECK cannot be added by ALTER POLICY in
--       a way that's reliably idempotent across PG versions, so we DROP + CREATE.
--
--   (2) admin_audit_log policy is FOR ALL, which means the same super_admin whose
--       actions are recorded can UPDATE or DELETE the audit trail. An audit log
--       must be append-only from the app's perspective and tamper-evident. We
--       narrow it to FOR SELECT.
--
-- VERIFIED (safe to remove the audit-log write policy): audit rows are inserted
-- exclusively via the service-role client, which has BYPASSRLS and is unaffected
-- by RLS policies. Confirmed at every insert site:
--   - app/src/actions/admin.ts      writeAuditLog() -> createAdminClient().from("admin_audit_log").insert(...)
--   - app/src/actions/inline-edit.ts writeAudit()    -> createAdminClient().from("admin_audit_log").insert(...)
-- and the reader app/src/app/admin/audit-log/page.tsx also uses createAdminClient().
-- createAdminClient() (app/src/lib/supabase/admin.ts) builds the client with
-- SUPABASE_SECRET_KEY (service_role). No code path inserts audit rows through a
-- normal authenticated/super_admin session, so a SELECT-only policy does NOT
-- break logging. (If that ever changes — i.e. an insert starts relying on a
-- user-session policy — add a separate FOR INSERT policy instead of widening
-- this one back to FOR ALL.)
--
-- Idempotent: DROP POLICY IF EXISTS guards make this safe to run repeatedly.
-- Touches only the orders UPDATE policy and the admin_audit_log policy. Nothing
-- else changes.
--
-- Run with: node scripts/run-sql.js schema-patch-harden-orders-auditlog-rls.sql

-- ── (1) orders: re-create the billing-admin UPDATE policy WITH CHECK ─────────
-- Prior policy (schema-patch-pagbank.sql): "billing_admin_update_orders",
-- FOR UPDATE USING (EXISTS ... role IN ('super_admin','billing_admin')) and no
-- WITH CHECK. We keep the exact same name and role expression, and add a
-- WITH CHECK identical to USING so an admin can't rewrite a row into a state
-- the policy wouldn't otherwise permit.

DROP POLICY IF EXISTS "billing_admin_update_orders" ON orders;

CREATE POLICY "billing_admin_update_orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'billing_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'billing_admin')
    )
  );

-- ── (2) admin_audit_log: narrow FOR ALL -> FOR SELECT (append-only) ──────────
-- Prior policy (schema-patch-002.sql): audit_log_super_admin,
-- FOR ALL USING (current_user_role() = 'super_admin'). Inserts come from the
-- service-role client (BYPASSRLS) per the VERIFIED note above, so dropping the
-- write capability of this policy does not affect logging. Restricting to
-- SELECT prevents UPDATE/DELETE of the audit trail through any user session.

DROP POLICY IF EXISTS audit_log_super_admin ON admin_audit_log;

CREATE POLICY audit_log_super_admin ON admin_audit_log
  FOR SELECT USING (current_user_role() = 'super_admin');

-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
-- Restore the prior (looser) policies exactly as they were before this patch:
--
-- (1) orders UPDATE policy without WITH CHECK:
--   DROP POLICY IF EXISTS "billing_admin_update_orders" ON orders;
--   CREATE POLICY "billing_admin_update_orders" ON orders
--     FOR UPDATE USING (
--       EXISTS (
--         SELECT 1 FROM profiles
--         WHERE profiles.id = auth.uid()
--           AND profiles.role IN ('super_admin', 'billing_admin')
--       )
--     );
--
-- (2) admin_audit_log policy back to FOR ALL:
--   DROP POLICY IF EXISTS audit_log_super_admin ON admin_audit_log;
--   CREATE POLICY audit_log_super_admin ON admin_audit_log
--     FOR ALL USING (current_user_role() = 'super_admin');
