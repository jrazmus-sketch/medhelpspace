-- NFS-e (nota fiscal de serviço) MANUAL issuance tracking on orders.
--
-- Decision (2026-06-27): we are NOT integrating an NFS-e API for now. At ~10-20
-- notas/month, Karina issues each NFS-e by hand on the WebISS Feira de Santana
-- portal (https://feiradesantanaba.webiss.com.br/), after the 7-day guarantee
-- window, skipping refunded sales. The /admin/notas-fiscais report turns each paid
-- order into a copy-paste-ready nota and tracks which have been issued.
--
-- These columns only RECORD the manual outcome — there is no automated emission and
-- no payment-code change. The "pending" list is computed from existing order fields
-- (status='paid', created_at + 7 days), so finalize.ts is untouched.
--
-- When volume justifies automation (≈50+/mo), revisit an API provider (Webmania /
-- Focus NFe support Feira de Santana) — these same columns carry over.
--
-- Run with: node scripts/run-sql.js schema-patch-nfse-issuance.sql

-- nfse_status: NULL (a emitir) | 'issued' (emitida e registrada) | 'skipped' (dispensada)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_status      TEXT;
-- número da NFS-e autorizada na prefeitura
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_number      TEXT;
-- código de verificação da nota (WebISS)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_verificacao TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_issued_at   TIMESTAMPTZ;
-- which admin recorded it (auth.users id)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_issued_by   UUID;
-- free-text note (e.g. reason for "dispensada")
ALTER TABLE orders ADD COLUMN IF NOT EXISTS nfse_notes       TEXT;

-- Status value guard (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_nfse_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_nfse_status_check
      CHECK (nfse_status IS NULL OR nfse_status IN ('issued', 'skipped'));
  END IF;
END $$;

-- The report lists paid orders not yet handled — index the open ones.
CREATE INDEX IF NOT EXISTS idx_orders_nfse_pending
  ON orders(created_at) WHERE status = 'paid' AND nfse_status IS NULL;

-- Rollback:
-- DROP INDEX IF EXISTS idx_orders_nfse_pending;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_nfse_status_check;
-- ALTER TABLE orders
--   DROP COLUMN IF EXISTS nfse_status,    DROP COLUMN IF EXISTS nfse_number,
--   DROP COLUMN IF EXISTS nfse_verificacao, DROP COLUMN IF EXISTS nfse_issued_at,
--   DROP COLUMN IF EXISTS nfse_issued_by, DROP COLUMN IF EXISTS nfse_notes;
