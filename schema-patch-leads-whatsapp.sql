-- schema-patch-leads-whatsapp.sql
-- Optional WhatsApp opt-in step in the lead funnels (Karina, 2026-09-28).
-- The number lives on the SAME lead row (keyed by e-mail) — never a second lead.
-- Idempotent. Apply to BOTH databases (prod via run-sql.js, local via DATABASE_URL).
--
-- Status is DERIVED (lib/whatsapp-optin.ts whatsappStatusOf):
--   revoked_at set            → Revogado
--   opt_in = true             → Autorizou
--   opt_in = false            → Não (clicked "continuar sem WhatsApp")
--   opt_in null + shown_at    → Não informado (saw the step, did not finish)
--   nothing                   → step never shown
--
-- Rollback:
--   ALTER TABLE leads DROP COLUMN whatsapp, DROP COLUMN whatsapp_opt_in,
--     DROP COLUMN whatsapp_opt_in_at, DROP COLUMN whatsapp_opt_in_source,
--     DROP COLUMN whatsapp_consent_version, DROP COLUMN whatsapp_revoked_at,
--     DROP COLUMN whatsapp_step_shown_at;
--   DELETE FROM site_pages WHERE page = 'whatsapp-optin';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp                 text,         -- E.164, e.g. +5511999999999
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in          boolean,      -- null = never answered
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at       timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source   text,         -- 'flashcards' | 'simulado'
  ADD COLUMN IF NOT EXISTS whatsapp_consent_version text,         -- lib/whatsapp-optin WHATSAPP_CONSENT_VERSION
  ADD COLUMN IF NOT EXISTS whatsapp_revoked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_step_shown_at   timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_whatsapp_opt_in_source_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_whatsapp_opt_in_source_check
      CHECK (whatsapp_opt_in_source IS NULL OR whatsapp_opt_in_source IN ('flashcards', 'simulado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_whatsapp_e164_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_whatsapp_e164_check
      CHECK (whatsapp IS NULL OR whatsapp ~ '^\+55[1-9][0-9]9[0-9]{8}$');
  END IF;
END $$;

-- The export/filter of authorised numbers is the hot path; everything else is null.
CREATE INDEX IF NOT EXISTS leads_whatsapp_opt_in_idx
  ON leads (whatsapp_opt_in_at DESC)
  WHERE whatsapp_opt_in = true AND whatsapp_revoked_at IS NULL;

COMMENT ON COLUMN leads.whatsapp IS 'WhatsApp number in E.164; only set with explicit opt-in (LGPD consent)';
COMMENT ON COLUMN leads.whatsapp_consent_version IS 'Which consent wording was accepted — lib/whatsapp-optin.ts WHATSAPP_CONSENT_VERSION';

-- Feature gate: false = only logged-in admins see the step (Karina's test mode).
INSERT INTO site_pages (page, published)
VALUES ('whatsapp-optin', false)
ON CONFLICT (page) DO NOTHING;
