-- NFS-e v4 — the Revalida tomador (Karina 2026-10-28, fourth reply).
--
-- Still MANUAL on the national Emissor: nothing here issues, cancels or talks to
-- any fiscal system, and no certificate or fiscal credential is ever stored.
--
-- Karina: "inclua também a opção 'Outra pessoa física' no checkout das turmas do
-- Revalida, para que os dois checkouts sigam a mesma estrutura" — the same
-- "Dados para a nota fiscal" block as ClinAct: the student himself (default),
-- another Pessoa Física, or a Pessoa Jurídica, with the full address.
--
-- orders gets the same tomador_* snapshot as clinact_subscriptions/invoices.
-- billing_first_name / billing_last_name / billing_cpf stay the STUDENT, always.
-- The other billing_* columns keep being written as before (address = the
-- tomador's, company fields on a PJ sale) so nothing reading them changes.
-- An order WITHOUT tomador_type is legacy (before this patch): the fiscal screen
-- keeps deriving its tomador from billing_person_type, as it always did.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-nfse-revalida-tomador.sql                 # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-nfse-revalida-tomador.sql               # local
--   (local: NOTIFY pgrst, 'reload schema';)
--
-- Apply to prod BEFORE pushing the code: the charge route writes these columns.
--
-- Rollback:
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_tomador_check;
--   ALTER TABLE orders DROP COLUMN IF EXISTS tomador_type, DROP COLUMN IF EXISTS tomador_name,
--     DROP COLUMN IF EXISTS tomador_document, DROP COLUMN IF EXISTS tomador_email,
--     DROP COLUMN IF EXISTS tomador_phone, DROP COLUMN IF EXISTS tomador_cep,
--     DROP COLUMN IF EXISTS tomador_street, DROP COLUMN IF EXISTS tomador_number,
--     DROP COLUMN IF EXISTS tomador_complement, DROP COLUMN IF EXISTS tomador_neighborhood,
--     DROP COLUMN IF EXISTS tomador_city, DROP COLUMN IF EXISTS tomador_state;

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_type         text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_name         text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_document     text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_email        text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_phone        text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_cep          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_street       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_number       text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_complement   text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_neighborhood text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_city         text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tomador_state        text;

-- Same rule as clinact_*: a row with a tomador must be complete enough to invoice.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tomador_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_tomador_check CHECK (tomador_type IS NULL OR (
      tomador_type IN ('aluno', 'pf', 'pj')
      AND tomador_name IS NOT NULL AND tomador_document IS NOT NULL
      AND tomador_cep IS NOT NULL AND tomador_street IS NOT NULL
      AND tomador_number IS NOT NULL AND tomador_city IS NOT NULL
      AND tomador_state IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN orders.tomador_type IS
  'Who the NFS-e is issued to, chosen in "Dados para a nota fiscal": aluno | pf (another person) | pj. NULL = order from before 2026-10-28 (derive from billing_person_type).';

COMMIT;
