-- Phase I: Admin operational layer
-- Run: node scripts/run-sql.js schema-patch-002.sql

-- 1. Soft-delete on cohorts (active=false hides from member-facing; still visible in admin)
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Manual override flag on cohort_module_access
--    When true, this row's unlock_date was set by an admin and survives test_date changes.
ALTER TABLE cohort_module_access ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false;

-- 3. Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id   uuid        NOT NULL REFERENCES auth.users(id),
  action          text        NOT NULL,
  target_user_id  uuid        REFERENCES auth.users(id),
  details         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super_admins can query the audit log; inserts bypass RLS via service role
CREATE POLICY audit_log_super_admin ON admin_audit_log
  FOR ALL USING (current_user_role() = 'super_admin');

-- 4. Update sync_module_unlock_dates() to skip rows that were manually overridden
CREATE OR REPLACE FUNCTION sync_module_unlock_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.test_date IS DISTINCT FROM OLD.test_date THEN
    UPDATE cohort_module_access a
    SET    unlock_date = NEW.test_date - m.unlock_offset_days
    FROM   content_modules m
    WHERE  a.content_module_id = m.id
      AND  a.cohort_id         = NEW.id
      AND  a.is_manual_override = false;
  END IF;
  RETURN NEW;
END;
$$;
