-- schema-patch-whatsapp-button-clinact.sql
-- The ClinAct half of the WhatsApp floating button (Karina 2026-09-28, asked
-- again 2026-11-01: "o mesmo botão flutuante do WhatsApp, exatamente igual ao do
-- Revalida"). Same mechanism as schema-patch-whatsapp-button.sql: one
-- `site_pages` row gates the button; flip it from /admin/settings (super_admin),
-- which revalidates /clinact.
--
-- Seeded as PUBLISHED, unlike the Revalida row: the button only renders on the
-- ClinAct sales page, and that page is itself unpublished — so today only admins
-- see it, which IS Karina's test mode. When she publishes the page, the button
-- goes public with it (she asked for it on the page). Back to admin-only at any
-- time from /admin/settings.
--
-- Idempotent. Apply to BOTH databases (prod via run-sql.js, local via DATABASE_URL).
-- Rollback: DELETE FROM site_pages WHERE page = 'whatsapp-clinact';

INSERT INTO site_pages (page, published)
VALUES ('whatsapp-clinact', true)
ON CONFLICT (page) DO NOTHING;
