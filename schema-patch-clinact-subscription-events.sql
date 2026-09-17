-- ClinAct — a durable log of the subscription webhooks PagBank sends us.
--
-- Karina's 2026-09-17 condition for submitting the homologation form: the
-- Recurring Payments API's OWN webhooks must be configured and tested, covering
-- approved payment/renewal, declined payment, recovery after a retry,
-- cancellation and suspension.
--
-- Why a table and not just logs: the homologation evidence has to show that the
-- events ARRIVED and what we did with them, and Vercel's log retention is not
-- evidence. This is also how we will later reconcile access with PagBank.
--
-- WHAT THIS TABLE IS NOT: it is not the access authority. Nothing here grants
-- anything. Access lives in `user_product_access.paid_until` and only ever
-- follows a payment confirmed by reading the API back — never a webhook body,
-- which is unauthenticated until we confirm how PagBank signs these calls
-- (their reference documents no signature for subscription webhooks at all).
--
-- `status` is deliberately the status we READ BACK from the API for that
-- subscription, not the one in the payload: a forged body cannot move it.
-- `header_names` exists because the signature mechanism is undocumented — the
-- first real deliveries are how we find out which headers actually arrive. It
-- stores header NAMES only, never their values (one of them may be a secret).
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-subscription-events.sql        # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-subscription-events.sql      # local
--
-- Rollback:
--   DROP TABLE IF EXISTS clinact_subscription_events;

BEGIN;

CREATE TABLE IF NOT EXISTS clinact_subscription_events (
  id              bigserial   PRIMARY KEY,
  -- 'subscription.activated', 'subscription.recurrence', … (PagBank's names).
  event           text        NOT NULL,
  subscription_id text,
  reference_id    text,
  -- Read back from the API after the event arrived. NULL = the re-read failed.
  status          text,
  -- 'valid' | 'invalid' | 'missing-header' | 'unconfigured' — see
  -- lib/pagbank/subscriptions-webhook-auth.ts.
  signature       text        NOT NULL,
  -- Which hash shape matched, when one did: 'dash' | 'concat'.
  signature_format text,
  -- Header NAMES only. Never header values.
  header_names    text[],
  payload         jsonb       NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_subscription_events_sub_idx
  ON clinact_subscription_events (subscription_id, received_at DESC);
CREATE INDEX IF NOT EXISTS clinact_subscription_events_received_idx
  ON clinact_subscription_events (received_at DESC);

COMMENT ON TABLE clinact_subscription_events IS
  'Append-only log of PagBank Pagamentos Recorrentes webhooks. Never the access authority: status is re-read from the API, and access lives in user_product_access.';

-- Access: service role only, exactly like site_sections. The webhook route uses
-- the admin client; nothing here should ever be reachable from a browser.
ALTER TABLE clinact_subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinact_subscription_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE clinact_subscription_events_id_seq FROM anon, authenticated;

COMMIT;
