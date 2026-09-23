-- schema-patch-integration-credentials.sql
--
-- Credentials that EXTERNAL services use to call us (2026-09-23). First user: the
-- Google Ads scheduled conversion upload, which fetches
--   https://www.medhelpspace.com.br/api/ads/conversions
-- daily with HTTP Basic auth, so nobody downloads/uploads the OCI CSV by hand.
--
-- Only a SHA-256 of the password is stored. Server-only: RLS on with no policies,
-- and no grants to anon/authenticated — the route reads it with the service role.
--
-- Rotate: UPDATE integration_credentials SET secret_sha256 = encode(sha256('<new>'::bytea),'hex'),
--         rotated_at = now() WHERE name = 'google_ads_oci_feed';  then update Google Ads.
-- Rollback: DROP TABLE IF EXISTS integration_credentials;

BEGIN;

CREATE TABLE IF NOT EXISTS integration_credentials (
  name           text PRIMARY KEY,
  username       text NOT NULL,
  secret_sha256  text NOT NULL CHECK (secret_sha256 ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  rotated_at     timestamptz
);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON integration_credentials FROM anon, authenticated;

COMMENT ON TABLE integration_credentials IS
  'Basic-auth credentials for inbound integrations (hash only). Service role only.';

COMMIT;
