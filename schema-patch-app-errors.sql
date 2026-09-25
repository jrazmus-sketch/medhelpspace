-- Error tracking without an external service: one row per DISTINCT error.
--
-- Before this, instrumentation.ts wrote each server error once into admin_alerts
-- (event 'server_error') and nothing ever displayed it: no page, no digest, no
-- bell. Repeats were dropped by the unique constraint, so an error hitting 500
-- students looked like one. Browser-side crashes were not recorded at all.
--
-- Now every occurrence goes through record_app_error(), which upserts by a
-- fingerprint computed in app code (kind + route + digest or normalised message)
-- and bumps count / last_seen. /admin/erros lists them; the daily admin digest
-- summarises the last 24h. Nothing here ever sends an instant e-mail, so an
-- error storm cannot become an e-mail storm.
--
-- PRIVACY: the app stores the PATH only, never the query string — query strings
-- on this site carry lead tokens and magic links.
--
-- Run with:
--   node scripts/run-sql.js schema-patch-app-errors.sql                     # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js schema-patch-app-errors.sql                   # local
--
-- Rollback:
--   DROP FUNCTION IF EXISTS record_app_error(text, text, text, text, text, text, text, text);
--   DROP TABLE IF EXISTS app_errors;

BEGIN;

CREATE TABLE IF NOT EXISTS app_errors (
  id          bigserial   PRIMARY KEY,
  fingerprint text        NOT NULL UNIQUE,
  kind        text        NOT NULL CHECK (kind IN ('server', 'client')),
  message     text        NOT NULL,
  route       text,
  digest      text,
  stack       text,
  last_path   text,
  user_agent  text,
  count       integer     NOT NULL DEFAULT 1,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_errors_last_seen_idx ON app_errors (last_seen DESC);

COMMENT ON TABLE app_errors IS
  'Distinct server/browser errors with occurrence counts. Written only via record_app_error() with the service role; read by /admin/erros and the admin digest.';

-- Service role only. Nothing about errors is for the browser to read directly.
ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_errors FROM anon, authenticated;
REVOKE ALL ON SEQUENCE app_errors_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION record_app_error(
  p_fingerprint text,
  p_kind        text,
  p_message     text,
  p_route       text,
  p_digest      text,
  p_stack       text,
  p_path        text,
  p_user_agent  text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO app_errors (fingerprint, kind, message, route, digest, stack, last_path, user_agent)
  VALUES (p_fingerprint, p_kind, left(p_message, 500), left(p_route, 300), left(p_digest, 100),
          left(p_stack, 3000), left(p_path, 300), left(p_user_agent, 300))
  ON CONFLICT (fingerprint) DO UPDATE SET
    count      = app_errors.count + 1,
    last_seen  = now(),
    last_path  = COALESCE(EXCLUDED.last_path, app_errors.last_path),
    user_agent = COALESCE(EXCLUDED.user_agent, app_errors.user_agent),
    -- Keep the first stack we captured unless we never had one.
    stack      = COALESCE(app_errors.stack, EXCLUDED.stack);
$$;

REVOKE EXECUTE ON FUNCTION record_app_error(text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_app_error(text, text, text, text, text, text, text, text) TO service_role;

COMMIT;
