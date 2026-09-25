-- ClinAct — the subscription itself, and an audit trail of the PagBank calls.
--
-- Two tables, for two different jobs.
--
-- 1. `clinact_subscriptions` — the link between OUR user and the PagBank
--    subscription. Without it a webhook is an orphan: PagBank tells us
--    SUBS_xxx was paid or cancelled and we have no idea whose access that is.
--    It is NOT the access authority: access lives in `user_product_access`
--    and only ever follows a PAID invoice.
--
--    One row per user per product line: a student has at most one ClinAct
--    subscription at a time, so `user_id` is unique. A cancelled subscription
--    is updated in place when they subscribe again (the previous PagBank id
--    stays in `clinact_subscription_events` and in the API log below).
--
-- 2. `pagbank_subscription_api_calls` — request and response of the calls we
--    make to the Pagamentos Recorrentes API. Two reasons, in order of
--    importance:
--      (a) PagBank's homologation asks for the request/response logs of plan,
--          subscriber and subscription creation. Those calls now happen inside
--          a deployed route, and Vercel keeps no artifact we can hand over.
--      (b) Afterwards it is the payments audit trail: when a student says they
--          were charged twice, this is what answers it.
--
--    NEVER stores the CVV. The route strips `security_code` before writing,
--    and this file's CHECK makes that structural rather than a habit: a row
--    whose request still contains the field is refused outright.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-clinact-subscriptions.sql              # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-clinact-subscriptions.sql            # local
--
-- Rollback:
--   DROP TABLE IF EXISTS pagbank_subscription_api_calls;
--   DROP TABLE IF EXISTS clinact_subscriptions;

BEGIN;

-- ── The subscription ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinact_subscriptions (
  user_id                 uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Our own identifier, sent as reference_id. It is how a lost 201 is
  -- recovered: PagBank does not deduplicate on it, but it CAN be searched by
  -- it (GET /subscriptions?reference_id=...).
  reference_id            text        NOT NULL UNIQUE,
  pagbank_subscription_id text        UNIQUE,
  pagbank_customer_id     text,
  plan_key                text        NOT NULL CHECK (plan_key IN ('mensal', 'anual')),
  pagbank_plan_id         text,
  -- Last status read back FROM THE API, never from a webhook body.
  status                  text,
  -- Card tail for the "meu cartão" screen. Never the number, never a token
  -- we do not need: PagBank holds the card.
  card_brand              text,
  card_last_digits        text,
  environment             text        NOT NULL CHECK (environment IN ('sandbox', 'production')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinact_subscriptions_pagbank_idx
  ON clinact_subscriptions (pagbank_subscription_id);

COMMENT ON TABLE clinact_subscriptions IS
  'Maps a ClinAct student to their PagBank subscription. Not the access authority — user_product_access is, and it follows the PAID invoice.';

ALTER TABLE clinact_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON clinact_subscriptions FROM anon, authenticated;

-- A student may read their own subscription (the "minha assinatura" screen
-- reads it server-side today, but this keeps the row honest if that changes).
DROP POLICY IF EXISTS clinact_subscriptions_select_own ON clinact_subscriptions;
CREATE POLICY clinact_subscriptions_select_own ON clinact_subscriptions
  FOR SELECT USING (
    user_id = auth.uid()
    OR current_user_role() IN ('super_admin', 'billing_admin', 'support_admin')
  );
GRANT SELECT ON clinact_subscriptions TO authenticated;

-- ── The API call log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pagbank_subscription_api_calls (
  id           bigserial   PRIMARY KEY,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reference_id text,
  environment  text        NOT NULL CHECK (environment IN ('sandbox', 'production')),
  method       text        NOT NULL,
  path         text        NOT NULL,
  status       integer     NOT NULL,
  -- Request as sent, MINUS the card security code. The encrypted card blob is
  -- kept: only PagBank can read it, and the homologation evidence needs the
  -- request to be complete.
  request      jsonb,
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  -- Structural, not a convention someone has to remember: a request carrying a
  -- security_code anywhere inside it cannot be written at all.
  CONSTRAINT pagbank_api_calls_no_cvv CHECK (request::text NOT LIKE '%security_code%')
);

CREATE INDEX IF NOT EXISTS pagbank_subscription_api_calls_ref_idx
  ON pagbank_subscription_api_calls (reference_id, id);
CREATE INDEX IF NOT EXISTS pagbank_subscription_api_calls_created_idx
  ON pagbank_subscription_api_calls (created_at DESC);

COMMENT ON TABLE pagbank_subscription_api_calls IS
  'Request/response of our calls to PagBank Pagamentos Recorrentes. Source of the homologation evidence file, and the payments audit trail. The CVV can never be stored: see the CHECK constraint.';

-- Service role only. Nothing here should ever be reachable from a browser.
ALTER TABLE pagbank_subscription_api_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pagbank_subscription_api_calls FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pagbank_subscription_api_calls_id_seq FROM anon, authenticated;

COMMIT;
