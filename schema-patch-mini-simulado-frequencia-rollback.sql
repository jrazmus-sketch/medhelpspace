-- Rollback of schema-patch-mini-simulado-frequencia.sql.
-- Deploy the previous app version first: the plan and the simulado player read these objects (both tolerate their
-- absence — the frequency falls back to Automática and a simulado opens on question 1, as before).
-- quiz_attempts is not touched by either file, so no answer history is lost.

BEGIN;

DROP VIEW IF EXISTS study_plan_simulado_pages;
DROP TABLE IF EXISTS quiz_runs;
ALTER TABLE study_plans DROP CONSTRAINT IF EXISTS study_plans_simulados_per_week_check;
ALTER TABLE study_plans DROP COLUMN IF EXISTS simulados_per_week;

COMMIT;
