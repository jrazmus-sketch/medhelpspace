-- Standardize all outbound/contact email onto a single monitored inbox.
--
-- Rationale: the app sends every email from one global `from_address` and sets no
-- Reply-To, so replies land on the From address. Legal pages + email footers also
-- exposed separate addresses (contato@, privacidade@). Collapsing everything onto
-- contato@medhelpspace.com.br means exactly ONE mailbox to monitor and zero forwards.
-- Domain is already verified in Resend (DKIM signs on the domain, not the local-part),
-- so changing the local-part needs no DNS changes.
--
-- Idempotent: sets fixed values on the singleton settings row (id = 1).
-- Rollback:
--   UPDATE email_settings
--   SET from_address  = 'MedHelpSpace <pagamentos@medhelpspace.com.br>',
--       contact_email = 'privacidade@medhelpspace.com.br'
--   WHERE id = 1;

UPDATE email_settings
SET from_address  = 'MedHelpSpace <contato@medhelpspace.com.br>',
    contact_email = 'contato@medhelpspace.com.br'
WHERE id = 1;
