-- ============================================================================
-- schema-patch-clinact-invoices-keep-on-delete.sql  (2026-11-20)
--
-- Deleting a member (Admin → Membros → Excluir) failed with "Database error deleting
-- user" for any account that ever paid a ClinAct invoice: clinact_invoices.user_id was
-- NOT NULL + ON DELETE RESTRICT (schema-patch-nfse-national-v2.sql). Karina hit it on
-- 19/11 while removing her ClinAct test account.
--
-- Same rule as orders (schema-patch-delete-member.sql): the fiscal record is KEPT and
-- only its link to the deleted account is cleared. The invoice already carries its own
-- payer/tomador snapshot (billing_*, tomador_*), so the Notas Fiscais screen still shows
-- who paid. An account with a ClinAct subscription that is still live at PagBank is
-- refused by deleteMember() in app code (deleting it would cascade the subscription row
-- away while PagBank kept charging).
--
-- Idempotent. Rollback: schema-patch-clinact-invoices-keep-on-delete-rollback.sql
-- ============================================================================

ALTER TABLE clinact_invoices ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE clinact_invoices DROP CONSTRAINT IF EXISTS clinact_invoices_user_id_fkey;
ALTER TABLE clinact_invoices
  ADD CONSTRAINT clinact_invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN clinact_invoices.user_id IS
  'Account that paid. NULL once that account is deleted — the invoice (a fiscal record) is kept, as orders are.';
