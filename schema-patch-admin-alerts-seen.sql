-- Per-admin "last seen" cursor for the admin notification bell's recent-events
-- feed (new_purchase / payment_problem / refund, read from admin_alerts).
--
-- admin_alerts is a SHARED append-only log (not per-user rows), so the cheapest
-- correct "unread" model is a single cursor per admin rather than per-row
-- read-state: opening the bell advances the cursor to now(), and anything in
-- admin_alerts created after the cursor counts as unseen. Missing row = never
-- seen anything (epoch default), matching the "missing row = default" pattern
-- already used by admin_notification_prefs.
--
-- Access model: same as admin_alerts / admin_notification_prefs — neither
-- member- nor even admin-client-facing directly; only the bell route + the
-- mark-seen server action touch it, both via createAdminClient() (service_role,
-- bypasses RLS). RLS is enabled with NO policies => deny-all to anon/authenticated.
--
-- Idempotent: safe to re-run.
--
-- Run with: node scripts/run-sql.js schema-patch-admin-alerts-seen.sql

CREATE TABLE IF NOT EXISTS admin_alerts_seen (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01'::timestamptz
);

ALTER TABLE admin_alerts_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_alerts_seen FROM anon, authenticated;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS admin_alerts_seen;
-- (No app code hard-depends on this table existing: getAdminAlertsFeed /
--  markAdminAlertsSeen wrap reads/writes so a rollback just makes every admin
--  see the full recent-events list as "unseen" every time — never breaks
--  anything else.)
