-- schema-patch-whatsapp-optin-publish.sql
-- Karina approved the test and the privacy text (2026-09-28 22:04 UTC): make the
-- WhatsApp opt-in step public. Same effect as "Publicar etapa" on /admin/settings.
-- Apply schema-patch-privacidade-whatsapp.sql alongside (the consent box links to
-- the policy). Idempotent; prod + local.
-- Rollback: UPDATE site_pages SET published = false WHERE page = 'whatsapp-optin';
UPDATE site_pages SET published = true, updated_at = now() WHERE page = 'whatsapp-optin' AND published = false;
