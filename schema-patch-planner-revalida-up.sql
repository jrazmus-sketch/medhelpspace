-- schema-patch-planner-revalida-up.sql
--
-- Meu Plano: Revalida Up becomes a content type the plan schedules (Karina
-- 2026-11-14, "Meu Plano – Adicionar Revalida Up aos tipos de conteúdo").
-- The engine (app/src/lib/study-plan/derive.ts) emits one Revalida Up item per
-- surfaced topic that has a topic_content 'revalida_up' link, between Questões
-- and Flashcards, when 'revalida_up' is in study_plans.preferred_content_types.
--
-- 1. Column default — rows created outside the wizard get the same list as
--    defaultPrefs() in derive.ts (DB and TS must agree; see
--    schema-patch-planner-content-types-default.sql for why that matters).
-- 2. Backfill — CONSERVATIVE, to respect each student's choice: 'revalida_up'
--    is added ONLY to rows that still have every option that existed before
--    (quiz, simulado, flashcards, audio, memorecards). A student who unticked
--    anything chose a narrower plan and is left exactly as they are; they can
--    tick Revalida Up themselves. On 2026-11-14 that is 1 of the 2 prod rows.
--
-- No CHECK constraint exists on the array values, so nothing else changes.
-- Idempotent: the default is re-settable; the backfill skips rows that already
-- contain 'revalida_up'.
--
-- Rollback:
--   ALTER TABLE study_plans ALTER COLUMN preferred_content_types
--     SET DEFAULT ARRAY['quiz','simulado','flashcards','audio','memorecards'];
--   UPDATE study_plans
--     SET preferred_content_types = array_remove(preferred_content_types, 'revalida_up')
--   WHERE 'revalida_up' = ANY(preferred_content_types);
--   (This also removes it from students who ticked it themselves after the deploy.)

ALTER TABLE study_plans
  ALTER COLUMN preferred_content_types
    SET DEFAULT ARRAY['quiz','simulado','revalida_up','flashcards','audio','memorecards'];

UPDATE study_plans
   SET preferred_content_types = preferred_content_types || ARRAY['revalida_up'],
       updated_at = now()
 WHERE preferred_content_types @> ARRAY['quiz','simulado','flashcards','audio','memorecards']::text[]
   AND NOT ('revalida_up' = ANY(preferred_content_types));
