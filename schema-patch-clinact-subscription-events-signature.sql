-- ClinAct — record WHICH header carried a webhook signature, and its shape.
--
-- Found by registering our endpoint and reading real deliveries (2026-09-17):
-- Pagamentos Recorrentes webhooks carry `x-payload-signature`, NOT the
-- `x-authenticity-token` the Orders API sends. PagBank's reference for
-- subscription webhooks documents no signature at all, so this is the only way
-- we learn it — and if they ever change the header, these columns show it
-- instead of every event silently failing verification.
--
-- `signature_sample` stores the value's LENGTH, its character class and its
-- first 8 characters — never the whole signature. That is enough to tell a
-- SHA-256 hash (64 hex chars, verifiable with our token) from an asymmetric
-- signature (long base64, which would need PagBank's public key).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-subscription-events-signature.sql      # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-subscription-events-signature.sql    # local
--
-- Rollback:
--   ALTER TABLE clinact_subscription_events
--     DROP COLUMN IF EXISTS signature_header,
--     DROP COLUMN IF EXISTS signature_sample;

BEGIN;

ALTER TABLE clinact_subscription_events
  ADD COLUMN IF NOT EXISTS signature_header text,
  ADD COLUMN IF NOT EXISTS signature_sample text;

COMMENT ON COLUMN clinact_subscription_events.signature_header IS
  'Which header carried the signature: x-payload-signature for Pagamentos Recorrentes (the Orders API uses x-authenticity-token).';
COMMENT ON COLUMN clinact_subscription_events.signature_sample IS
  'Shape hint only — length, character class and first 8 chars. Never the whole signature.';

COMMIT;
