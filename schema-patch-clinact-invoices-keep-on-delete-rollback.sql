-- Rollback of schema-patch-clinact-invoices-keep-on-delete.sql.
-- Refuses (NOT NULL fails) if an account with ClinAct invoices was deleted after the
-- patch — those invoices have user_id NULL and cannot point back at a deleted account.

ALTER TABLE clinact_invoices DROP CONSTRAINT IF EXISTS clinact_invoices_user_id_fkey;
ALTER TABLE clinact_invoices
  ADD CONSTRAINT clinact_invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE clinact_invoices ALTER COLUMN user_id SET NOT NULL;

COMMENT ON COLUMN clinact_invoices.user_id IS NULL;
