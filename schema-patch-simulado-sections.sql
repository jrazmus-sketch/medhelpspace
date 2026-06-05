-- schema-patch-simulado-sections.sql
--
-- Adds `simulado_sections` table holding the user-facing label for each
-- top-level simulado category shown on /app/estudo-por-questoes (the
-- "Simulados" tab): currently "Geral" and "Por Temas".
--
-- These two strings were previously hardcoded in
-- app/src/app/app/estudo-por-questoes/page.tsx (the `simuladosSections` array).
-- Moving them to a table lets the inline editor (EditableText / front-end
-- "Edição rápida") write to them, exactly like the study-type cards above.
--
-- `key` is a stable slug used to join JS defaults (icon) to the DB row; only
-- `label` is editable. Icon slug stays in JS — it isn't editable.
--
-- Idempotent (safe to re-run): table + policies use IF NOT EXISTS / DROP-IF-EXISTS,
-- seed uses ON CONFLICT (key) DO NOTHING so existing edits are preserved.
--
-- Rollback:
--   DROP TABLE IF EXISTS simulado_sections;

BEGIN;

CREATE TABLE IF NOT EXISTS simulado_sections (
  id          SERIAL       PRIMARY KEY,
  key         TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  position    INT          NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE simulado_sections ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — these are public UI strings.
DROP POLICY IF EXISTS simulado_sections_select_all ON simulado_sections;
CREATE POLICY simulado_sections_select_all ON simulado_sections
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin. The inline-edit server
-- action goes through the service-role client (RLS-bypassing) so this policy
-- is defense-in-depth for any future non-admin writer.
DROP POLICY IF EXISTS simulado_sections_update_admin ON simulado_sections;
CREATE POLICY simulado_sections_update_admin ON simulado_sections
  FOR UPDATE USING (current_user_role() IN ('super_admin', 'content_admin'));

-- Seed the two canonical rows. ON CONFLICT preserves any prior edits on re-run.
INSERT INTO simulado_sections (key, label, position) VALUES
  ('geral',     'Geral',     0),
  ('por-temas', 'Por Temas', 1)
ON CONFLICT (key) DO NOTHING;

COMMIT;
