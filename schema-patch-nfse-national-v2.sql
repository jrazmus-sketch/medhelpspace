-- NFS-e v2 — one fiscal screen for every MedHelpSpace product (Karina 2026-10-27).
--
-- From 01/11/2026 notas are issued MANUALLY on the national Emissor
-- (https://www.nfse.gov.br/EmissorNacional). Nothing here issues, cancels or
-- talks to any fiscal system: these columns only RECORD what Karina did there.
-- No certificate, password or fiscal credential is ever stored.
--
-- Three changes:
--
-- 1. orders — buying as Pessoa Física (default) or Pessoa Jurídica. A PJ sale
--    keeps the student (billing_first_name/last_name/cpf, the person who studies)
--    and the tomador of the nota (billing_company_name/cnpj/email) SEPARATE.
--    The address on a PJ order is the company's.
--
-- 2. NFS-e lifecycle on orders: 'cancelled' joins 'issued' / 'skipped', with its
--    own timestamp. "Cancelada" (the NOTA was cancelled) and "Reembolsada" (the
--    MONEY went back — orders.status = 'refunded') stay two different facts.
--
-- 3. clinact_invoices — one row per PAID ClinAct invoice (first charge AND every
--    renewal), so each gets its own nota. Before this, ClinAct payments existed
--    only at PagBank. Rows are written best-effort by the same code that already
--    reads the invoices (checkout, renewal cron, webhook) and are NEVER the access
--    authority — user_product_access is. The tomador is the cardholder typed at
--    checkout, snapshotted from clinact_subscriptions.billing_* when the row is
--    first written; the student is the account (user_id).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-nfse-national-v2.sql                    # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-nfse-national-v2.sql                  # local
--   (local: NOTIFY pgrst, 'reload schema';)
--
-- Rollback:
--   DROP TABLE IF EXISTS clinact_invoices;
--   ALTER TABLE clinact_subscriptions
--     DROP COLUMN IF EXISTS billing_name, DROP COLUMN IF EXISTS billing_tax_id,
--     DROP COLUMN IF EXISTS billing_phone;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_billing_pj_check;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_billing_person_type_check;
--   ALTER TABLE orders
--     DROP COLUMN IF EXISTS billing_person_type, DROP COLUMN IF EXISTS billing_company_name,
--     DROP COLUMN IF EXISTS billing_cnpj, DROP COLUMN IF EXISTS billing_company_email,
--     DROP COLUMN IF EXISTS nfse_cancelled_at;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_nfse_status_check;
--   ALTER TABLE orders ADD CONSTRAINT orders_nfse_status_check
--     CHECK (nfse_status IS NULL OR nfse_status IN ('issued', 'skipped'));
--   (fails if any row is already 'cancelled' — set those back to 'issued' first)

BEGIN;

-- ── 1. PF / PJ on orders ─────────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_person_type   text NOT NULL DEFAULT 'pf';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_company_name  text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_cnpj          text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_company_email text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_billing_person_type_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_billing_person_type_check
      CHECK (billing_person_type IN ('pf', 'pj'));
  END IF;
  -- A PJ sale without razão social + CNPJ cannot be invoiced: refuse it at the
  -- door rather than discover it on the fiscal screen.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_billing_pj_check') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_billing_pj_check
      CHECK (billing_person_type = 'pf'
             OR (billing_company_name IS NOT NULL AND billing_cnpj IS NOT NULL));
  END IF;
END $$;

-- ── 2. "Cancelada" on orders ─────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_cancelled_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_nfse_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_nfse_status_check
  CHECK (nfse_status IS NULL OR nfse_status IN ('issued', 'skipped', 'cancelled'));

-- ── 3. ClinAct: the cardholder (tomador) snapshot + one row per paid invoice ──

ALTER TABLE clinact_subscriptions ADD COLUMN IF NOT EXISTS billing_name   text;
ALTER TABLE clinact_subscriptions ADD COLUMN IF NOT EXISTS billing_tax_id text;
ALTER TABLE clinact_subscriptions ADD COLUMN IF NOT EXISTS billing_phone  text;

CREATE TABLE IF NOT EXISTS clinact_invoices (
  -- PagBank's INVO_ id: the natural key, so re-reading the same invoice from the
  -- cron, the webhook and the checkout can only ever write it once.
  id               text        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subscription_id  text        NOT NULL,
  plan_key         text        NOT NULL CHECK (plan_key IN ('mensal', 'anual')),
  occurrence       integer     NOT NULL,
  amount_cents     integer     NOT NULL,
  -- When PagBank opened the invoice (the billing date) and when we first saw it
  -- PAID (its updated_at at that moment — PagBank's invoice has no paid_at).
  billed_at        timestamptz NOT NULL,
  paid_at          timestamptz NOT NULL,
  -- Período de referência, Brasília calendar days, both inclusive.
  period_start     date        NOT NULL,
  period_end       date        NOT NULL,
  environment      text        NOT NULL CHECK (environment IN ('sandbox', 'production')),
  -- Tomador snapshot (the cardholder typed at checkout).
  billing_name     text,
  billing_tax_id   text,
  billing_phone    text,
  -- Money returned to the student. ClinAct has no refund flow in the app yet, so
  -- this is marked by hand after a refund made in the PagBank panel.
  refunded_at      timestamptz,
  -- NFS-e, recorded manually — same meaning as on orders.
  nfse_status      text        CHECK (nfse_status IS NULL OR nfse_status IN ('issued', 'cancelled')),
  nfse_number      text,
  nfse_verificacao text,
  nfse_issued_at   timestamptz,
  nfse_issued_by   uuid,
  nfse_cancelled_at timestamptz,
  nfse_notes       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_invoices_paid_idx ON clinact_invoices (paid_at DESC);
CREATE INDEX IF NOT EXISTS clinact_invoices_user_idx ON clinact_invoices (user_id);

COMMENT ON TABLE clinact_invoices IS
  'One row per PAID ClinAct invoice (first charge and renewals) for the manual NFS-e screen. Written best-effort from the invoice reads; never the access authority.';

-- Service role only: buyer fiscal PII. The admin screen reads it server-side.
ALTER TABLE clinact_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinact_invoices FROM anon, authenticated;

COMMIT;
