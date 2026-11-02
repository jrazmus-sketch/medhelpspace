-- schema-patch-clinact-refund.sql
-- The "Reembolsar" button for a ClinAct invoice (Karina 2026-11-02): one action
-- that cancels the subscription, refunds the payment through the PagBank
-- recurrence API, ends ClinAct access and records the refund on the invoice —
-- with WHEN and WHICH ADMIN did it.
--
--   refunded_by        — the admin who refunded (app button) or recorded a refund
--                        made in the PagBank panel (manual mark). NULL on refunds
--                        recorded before this patch.
--   refund_id          — PagBank's REFU_ id when the app made the refund. NULL on a
--                        manual mark, which is what tells the two apart: only a
--                        manual mark can be undone (money moved by the app stays
--                        moved).
--   refund_claimed_at  — a short-lived claim taken BEFORE touching money, so a
--                        double click or two admins can only refund once (same
--                        pattern as orders.refund_claimed_at).
--
-- Idempotent. Rollback:
--   ALTER TABLE clinact_invoices DROP COLUMN IF EXISTS refunded_by,
--                                DROP COLUMN IF EXISTS refund_id,
--                                DROP COLUMN IF EXISTS refund_claimed_at;

BEGIN;

ALTER TABLE clinact_invoices ADD COLUMN IF NOT EXISTS refunded_by       uuid;
ALTER TABLE clinact_invoices ADD COLUMN IF NOT EXISTS refund_id         text;
ALTER TABLE clinact_invoices ADD COLUMN IF NOT EXISTS refund_claimed_at timestamptz;

COMMENT ON COLUMN clinact_invoices.refunded_at IS
  'Money returned to the student: set by the Reembolsar button (refund_id set) or recorded by hand after a refund made in the PagBank panel (refund_id NULL).';
COMMENT ON COLUMN clinact_invoices.refunded_by IS
  'Admin who refunded or recorded the refund. NULL on refunds recorded before 2026-11-02.';
COMMENT ON COLUMN clinact_invoices.refund_id IS
  'PagBank REFU_ id of a refund made by the app. NULL = recorded by hand.';

COMMIT;
