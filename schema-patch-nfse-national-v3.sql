-- NFS-e v3 — internal tests + the ClinAct tomador (Karina 2026-10-27, third reply).
--
-- Still MANUAL on the national Emissor: nothing here issues, cancels or talks to
-- any fiscal system, and no certificate or fiscal credential is ever stored.
--
-- Two changes:
--
-- 1. internal_test on orders AND clinact_invoices. MedHelpSpace has made NO sale
--    to a customer yet: every paid/refunded record before this patch is an
--    internal test (the R$ 1,00 Revalida orders of June/July and the R$ 29,90
--    ClinAct charge of 25/09/2026). A test is never shown as a sale nor counted
--    as a nota pending on the Emissor Nacional (screen, bell, digest, dashboard).
--    It is a FLAG, not a date rule: a real sale between today and 01/11/2026 must
--    still show up as a sale. Later tests are marked by hand on the fiscal screen.
--    The R$ 29,90 charge was refunded in the PagBank panel (Karina verified) —
--    recorded here as refunded, kept in the history, never deleted.
--
-- 2. The ClinAct tomador. Karina: the cardholder is NOT automatically the tomador
--    — the card may belong to someone who neither contracts nor receives the
--    nota. The checkout now has "Dados para a nota fiscal": the student himself
--    (default), another Pessoa Física, or a Pessoa Jurídica, with the full
--    address. Snapshotted on clinact_subscriptions at checkout and copied onto
--    each clinact_invoices row when it is first written. billing_name/tax_id/
--    phone stay what they always were: the CARDHOLDER, payment data only.
--    The student is the account (user_id) and stays separate.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-nfse-national-v3.sql                    # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-nfse-national-v3.sql                  # local
--   (local: NOTIFY pgrst, 'reload schema';)
--
-- Rollback:
--   ALTER TABLE orders DROP COLUMN IF EXISTS internal_test;
--   ALTER TABLE clinact_invoices DROP COLUMN IF EXISTS internal_test;
--   (and, per table clinact_subscriptions / clinact_invoices:)
--   ALTER TABLE <t> DROP CONSTRAINT IF EXISTS <t>_tomador_check;
--   ALTER TABLE <t> DROP COLUMN IF EXISTS tomador_type, DROP COLUMN IF EXISTS tomador_name,
--     DROP COLUMN IF EXISTS tomador_document, DROP COLUMN IF EXISTS tomador_email,
--     DROP COLUMN IF EXISTS tomador_phone, DROP COLUMN IF EXISTS tomador_cep,
--     DROP COLUMN IF EXISTS tomador_street, DROP COLUMN IF EXISTS tomador_number,
--     DROP COLUMN IF EXISTS tomador_complement, DROP COLUMN IF EXISTS tomador_neighborhood,
--     DROP COLUMN IF EXISTS tomador_city, DROP COLUMN IF EXISTS tomador_state;
--   The R$ 29,90 refund mark: UPDATE clinact_invoices SET refunded_at = NULL
--     WHERE id = 'INVO_AA1785AF-D94D-4997-B48D-3B43ED8D51D0';

BEGIN;

-- ── 1. Internal tests ────────────────────────────────────────────────────────

ALTER TABLE orders           ADD COLUMN IF NOT EXISTS internal_test boolean NOT NULL DEFAULT false;
ALTER TABLE clinact_invoices ADD COLUMN IF NOT EXISTS internal_test boolean NOT NULL DEFAULT false;

-- Everything paid/refunded before 28/10/2026 00:00 Brasília. Checked by hand on
-- prod before applying: 9 Revalida orders, all R$ 1,00 and refunded (one with
-- the June WebISS test nota), and 1 ClinAct invoice, R$ 29,90 of 25/09.
UPDATE orders
   SET internal_test = true
 WHERE status IN ('paid', 'refunded')
   AND created_at < '2026-10-28T03:00:00Z'
   AND internal_test = false;

UPDATE clinact_invoices
   SET internal_test = true
 WHERE paid_at < '2026-10-28T03:00:00Z'
   AND internal_test = false;

-- Karina's real-card test of 25/09/2026, refunded in the PagBank panel. The
-- refund date is not readable from the recurrence API, so it is recorded as
-- today. No-op where the row does not exist (local).
UPDATE clinact_invoices
   SET refunded_at = now()
 WHERE id = 'INVO_AA1785AF-D94D-4997-B48D-3B43ED8D51D0'
   AND refunded_at IS NULL;

-- ── 2. ClinAct tomador ───────────────────────────────────────────────────────
--   tomador_type: 'aluno' (the student himself) | 'pf' (another person) | 'pj'
--   tomador_name: nome completo, or razão social when pj
--   tomador_document: CPF, or CNPJ when pj — digits only

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinact_subscriptions', 'clinact_invoices'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_type         text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_name         text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_document     text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_email        text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_phone        text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_cep          text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_street       text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_number       text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_complement   text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_neighborhood text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_city         text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tomador_state        text', t);
    -- A row without a tomador is legacy (before this patch); a row WITH one must
    -- be complete enough to invoice — refuse it at the door.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_tomador_check') THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (tomador_type IS NULL OR (
           tomador_type IN (''aluno'', ''pf'', ''pj'')
           AND tomador_name IS NOT NULL AND tomador_document IS NOT NULL
           AND tomador_cep IS NOT NULL AND tomador_street IS NOT NULL
           AND tomador_number IS NOT NULL AND tomador_city IS NOT NULL
           AND tomador_state IS NOT NULL))',
        t, t || '_tomador_check');
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN clinact_invoices.internal_test IS
  'Internal test, not a sale: never listed as a sale nor as a nota pending on the Emissor Nacional.';
COMMENT ON COLUMN orders.internal_test IS
  'Internal test, not a sale: never listed as a sale nor as a nota pending on the Emissor Nacional.';

COMMIT;
