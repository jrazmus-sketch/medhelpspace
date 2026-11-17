-- schema-patch-plano-cobertura-rollback.sql — removes everything schema-patch-plano-cobertura.sql added.
-- Deploy the previous app version first: the new plan code reads these objects (it falls back to defaults when
-- they are missing, but the admin screen would show an error).
BEGIN;
DROP FUNCTION IF EXISTS study_plan_pace_stats();
DROP FUNCTION IF EXISTS study_plan_flashcard_facts(uuid, timestamptz);
DROP VIEW IF EXISTS study_plan_medvoice_lessons;
DROP VIEW IF EXISTS study_plan_revalida_up_pages;
DROP VIEW IF EXISTS study_plan_flashcard_groups;
ALTER TABLE lessons DROP COLUMN IF EXISTS audio_duration_seconds;
ALTER TABLE study_plans DROP CONSTRAINT IF EXISTS study_plans_pace_mode_check;
ALTER TABLE study_plans DROP COLUMN IF EXISTS pace_mode;
DROP TABLE IF EXISTS study_plan_settings;
COMMIT;
