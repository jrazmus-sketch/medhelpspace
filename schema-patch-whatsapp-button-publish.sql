-- schema-patch-whatsapp-button-publish.sql
-- Karina confirmed the test (2026-09-28); make the Revalida WhatsApp button public.
-- Same effect as "Publicar botão" on /admin/settings. Idempotent; apply to prod + local.
-- Rollback: UPDATE site_pages SET published = false WHERE page = 'whatsapp-revalida';
UPDATE site_pages SET published = true, updated_at = now() WHERE page = 'whatsapp-revalida' AND published = false;
