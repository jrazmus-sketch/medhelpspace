-- schema-patch-medhelp60-cronograma.sql
--
-- MedHelp 60D — cronograma na própria página (Karina 2026-11-17 23h06 + 2026-11-18): the 60 days before the exam as a
-- FIXED sequence of weeks (Fórmula MedHelp + MemoreCards by priority, the seven Simulados 100Q with time for
-- correction), a MANUAL checklist, and one availability shared with Meu Plano.
--   1. medhelp60_checks — the student's own ticks, one row per (user, item). The schedule itself is NOT stored: it is
--      rebuilt from the exam date, the topics' priorities and the materials that exist (lib/medhelp-60d/cronograma.ts),
--      so a material delivered later simply appears in its place.
--   2. study_plan_settings — three time estimates for the 60D materials, editable at /admin/plano.
-- Nothing here touches content, progress, the Revisão or any turma date. Re-run safe.
-- Rollback: schema-patch-medhelp60-cronograma-rollback.sql.

BEGIN;

-- ── 1. The manual checklist ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medhelp60_checks (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key   text        NOT NULL CHECK (item_key ~ '^(formula|memore|sim|sim-correcao):[0-9]+$'),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_key)
);
COMMENT ON TABLE medhelp60_checks IS
  'MedHelp 60D manual checklist (Karina 2026-11-17): the items a student ticked. item_key = formula:<page id> | '
  'memore:<Revalida Up page id> | sim:<n> | sim-correcao:<n>. Written by the student (RLS: own rows only).';

ALTER TABLE medhelp60_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON medhelp60_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON medhelp60_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON medhelp60_checks TO service_role;

DROP POLICY IF EXISTS medhelp60_checks_select_own ON medhelp60_checks;
CREATE POLICY medhelp60_checks_select_own ON medhelp60_checks FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS medhelp60_checks_insert_own ON medhelp60_checks;
CREATE POLICY medhelp60_checks_insert_own ON medhelp60_checks FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS medhelp60_checks_delete_own ON medhelp60_checks;
CREATE POLICY medhelp60_checks_delete_own ON medhelp60_checks FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── 2. Time estimates of the 60D materials ─────────────────────────────────────────────────────────────────
ALTER TABLE study_plan_settings
  ADD COLUMN IF NOT EXISTS d60_minutes_per_formula_page        numeric(5,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS d60_seconds_per_memorecard          integer      NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS d60_correction_minutes_per_question numeric(5,2) NOT NULL DEFAULT 1;
COMMENT ON COLUMN study_plan_settings.d60_minutes_per_formula_page IS 'MedHelp 60D: minutes to study one Fórmula MedHelp page.';
COMMENT ON COLUMN study_plan_settings.d60_seconds_per_memorecard IS 'MedHelp 60D: seconds per MemoreCard.';
COMMENT ON COLUMN study_plan_settings.d60_correction_minutes_per_question IS 'MedHelp 60D: minutes to correct one question of a Simulado 100Q.';

COMMIT;

NOTIFY pgrst, 'reload schema';
