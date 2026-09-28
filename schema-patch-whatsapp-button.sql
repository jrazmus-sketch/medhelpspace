-- schema-patch-whatsapp-button.sql
-- WhatsApp Business floating button (Karina, 2026-09-28). No new table: the
-- button is gated by a `site_pages` row per product, the same page-level publish
-- gate the ClinAct sales page uses. false = only logged-in admins see the button
-- (Karina's test mode); true = public. Flip from /admin/settings (super_admin),
-- which also revalidates "/" and "/loja".
--
-- Idempotent. Apply to BOTH databases (prod via run-sql.js, local via DATABASE_URL).
-- The ClinAct chat seeds 'whatsapp-clinact' the same way when it mounts the button.
-- Rollback: DELETE FROM site_pages WHERE page = 'whatsapp-revalida';

INSERT INTO site_pages (page, published)
VALUES ('whatsapp-revalida', false)
ON CONFLICT (page) DO NOTHING;
