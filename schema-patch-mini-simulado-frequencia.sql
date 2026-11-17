-- schema-patch-mini-simulado-frequencia.sql
--
-- Mini simulados no Meu Plano (Karina 2026-11-17, "sim, autorizo construir, testar e publicar os ajustes A, B, C e D").
--   1. study_plans.simulados_per_week — the student's chosen frequency: NULL = Automática (the 25% reference of
--      study_plan_settings), 1 or 2 = that many a week (the 25% limit does not apply).
--   2. quiz_runs — where the student's CURRENT run of a simulado begins. No row = the run is the whole history, so
--      every mini simulado left half-way before this patch resumes where it stopped. "Recomeçar" only moves this
--      timestamp forward: quiz_attempts is never touched, so the history of earlier attempts is preserved.
--   3. study_plan_simulado_pages — one row per published simulado page with its question ids (the plan needs them
--      to know which mini simulado is in progress and how many questions are left).
-- Nothing here touches content, attempts, review or incidence. Re-run safe. Rollback: ...-rollback.sql.

BEGIN;

-- ── 1. The student's frequency ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE study_plans ADD COLUMN IF NOT EXISTS simulados_per_week smallint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'study_plans_simulados_per_week_check') THEN
    ALTER TABLE study_plans ADD CONSTRAINT study_plans_simulados_per_week_check
      CHECK (simulados_per_week IS NULL OR simulados_per_week IN (1, 2));
  END IF;
END $$;
COMMENT ON COLUMN study_plans.simulados_per_week IS
  'Mini simulados per week chosen by the student. NULL = Automática (study_plan_settings, 25% reference).';

-- ── 2. The current run of a simulado ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_runs (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id    integer     NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);
COMMENT ON TABLE quiz_runs IS
  'Start of the student''s current run of a simulado page (Karina 2026-11-17). Answers with created_at >= started_at '
  'belong to the run; no row = the whole history. Written only by /api/quiz-attempt (service role).';
ALTER TABLE quiz_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quiz_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON quiz_runs TO service_role;

-- ── 3. Simulado pages, with their questions ────────────────────────────────────────────────────────────────
-- is_mini = a regular mini simulado (Questões › Simulados). The MedHelp 60D Simulados 100Q share the shape and
-- differ only by content_module_id; the plan never schedules them, it only knows one was answered this week.
CREATE OR REPLACE VIEW study_plan_simulado_pages WITH (security_invoker = true) AS
SELECT p.id AS page_id, p.slug, p.title,
       COALESCE(s.slug, 'geral') AS specialty_slug,
       (p.content_module_id IS NULL) AS is_mini,
       COALESCE(array_agg(q.id ORDER BY q.position, q.id) FILTER (WHERE q.id IS NOT NULL), '{}')::int[] AS question_ids
  FROM pages p
  LEFT JOIN specialties s ON s.id = p.specialty_id
  LEFT JOIN quiz_questions q ON q.page_id = p.id
 WHERE p.view = 'simulados' AND p.type = 'h5p-quiz' AND p.status = 'publish'
 GROUP BY p.id, s.slug;
REVOKE ALL ON study_plan_simulado_pages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON study_plan_simulado_pages TO service_role;

COMMIT;
