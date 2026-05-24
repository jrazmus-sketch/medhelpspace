-- schema-patch-study-types.sql
--
-- Adds `study_types` table holding the user-facing label + description for each
-- StudyTypeKey ("quiz", "simulados", "resumos", "formula", "medvoice",
-- "audiocards", "flashcards", "medhelp60"). These strings were previously
-- hardcoded in lib/page-type.ts (STUDY_TYPE_CONFIG) and shown on:
--   - /app/estudo-por-questoes (the two choice cards at the top)
--   - /app/[specialty]      (the study-type card grid on each specialty hub)
--
-- Moving them to a table lets the inline editor (EditableText / front-end
-- "Edição rápida") write to them. Icon, color, and hubHref remain in JS — those
-- aren't editable.
--
-- Column `description` (not `desc`) — `desc` is a SQL reserved word.
--
-- Idempotent (safe to re-run): table + policies use IF NOT EXISTS / DROP-IF-EXISTS,
-- seed uses ON CONFLICT (key) DO NOTHING so existing edits are preserved.
--
-- Rollback:
--   DROP TABLE IF EXISTS study_types;

BEGIN;

CREATE TABLE IF NOT EXISTS study_types (
  id          SERIAL       PRIMARY KEY,
  key         TEXT         UNIQUE NOT NULL,
  label       TEXT         NOT NULL,
  description TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE study_types ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read — these are public UI strings.
DROP POLICY IF EXISTS study_types_select_all ON study_types;
CREATE POLICY study_types_select_all ON study_types
  FOR SELECT USING (true);

-- Writes restricted to super_admin / content_admin. The inline-edit server
-- action goes through the service-role client (RLS-bypassing) so this policy
-- is defense-in-depth for any future non-admin writer.
DROP POLICY IF EXISTS study_types_update_admin ON study_types;
CREATE POLICY study_types_update_admin ON study_types
  FOR UPDATE USING (current_user_role() IN ('super_admin', 'content_admin'));

-- Seed the 8 canonical rows from current STUDY_TYPE_CONFIG values.
-- ON CONFLICT preserves any prior edits if the patch is re-run.
INSERT INTO study_types (key, label, description) VALUES
  ('quiz',       'Questões Revalida',   'Questões estilo INEP comentadas'),
  ('simulados',  'Simulados',           'Treino de prova por casos clínicos'),
  ('resumos',    'Resumos Narrativos',  'Narrativas clínicas por especialidade'),
  ('formula',    'Fórmula MedHelp',     'Condutas clínicas em formato visual'),
  ('medvoice',   'MedVoice',            'Áudios por tema — a Clínica Fala'),
  ('audiocards', 'AudioCards',          'Revisão em áudio, cartão por cartão'),
  ('flashcards', 'Flashcards',          'Revisão ativa com cartões'),
  ('medhelp60',  'MedHelp 60D',         'Conteúdo dos 60 dias finais')
ON CONFLICT (key) DO NOTHING;

COMMIT;
