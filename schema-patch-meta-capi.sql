-- schema-patch-meta-capi.sql
--
-- Meta Pixel + Conversions API (Karina 2026-11-04 / 2026-11-09).
--
-- 1. orders.meta_capi / clinact_subscriptions.meta_capi — the browser context
--    frozen at checkout (fbp, fbc, IP, user agent, page, optional Test Events
--    code). Written ONLY when the buyer had accepted advertising cookies; NULL
--    means "never send a Purchase for this one". Purchase is sent later, from
--    the server, when PagBank confirms the payment — the browser is long gone
--    by then (Pix webhook, renewal cron), so this is the only place it can live.
--
-- 2. meta_capi_events — one row per Purchase ever sent, keyed by the same
--    event_id the Pixel would use (revalida_<order id> / clinact_<subscription
--    id>). The INSERT is the claim: a webhook replay, a status poll and the
--    charge route racing each other can only ever send one Purchase.
--
-- Server-only (service role). RLS on with no policies; anon/authenticated revoked.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.meta_capi_events;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS meta_capi;
--   ALTER TABLE public.clinact_subscriptions DROP COLUMN IF EXISTS meta_capi;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta_capi jsonb;
ALTER TABLE public.clinact_subscriptions ADD COLUMN IF NOT EXISTS meta_capi jsonb;

COMMENT ON COLUMN public.orders.meta_capi IS
  'Meta CAPI context frozen at checkout, only when advertising cookies were accepted. NULL = no Purchase is sent.';
COMMENT ON COLUMN public.clinact_subscriptions.meta_capi IS
  'Meta CAPI context frozen at checkout for the CURRENT subscription of the row (rewritten with it). NULL = no Purchase is sent.';

CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  event_id      text PRIMARY KEY,
  event_name    text NOT NULL,
  product       text NOT NULL CHECK (product IN ('revalida', 'clinact')),
  value_cents   integer NOT NULL,
  user_id       uuid,
  test_event_code text,
  http_status   integer,
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_capi_events FROM anon, authenticated;
