-- schema-patch-medhelp60-cronograma-rollback.sql — undoes schema-patch-medhelp60-cronograma.sql.
-- Deploy the previous code first. The students' ticks are lost.
BEGIN;
DROP TABLE IF EXISTS medhelp60_checks;
ALTER TABLE study_plan_settings
  DROP COLUMN IF EXISTS d60_minutes_per_formula_page,
  DROP COLUMN IF EXISTS d60_seconds_per_memorecard,
  DROP COLUMN IF EXISTS d60_correction_minutes_per_question;
COMMIT;
NOTIFY pgrst, 'reload schema';
