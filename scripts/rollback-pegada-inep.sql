-- rollback-pegada-inep.sql — removes the 38 "Questões Pegada INEP" simulados added by
-- scripts/apply-pegada-inep.js (Karina 2026-10-17). They were NEW pages, so there is no
-- "before" state to restore: rolling back = deleting them.
--
--   node scripts/run-sql.js scripts/rollback-pegada-inep.sql                       # prod
--   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:55322/postgres" \
--     node scripts/run-sql.js scripts/rollback-pegada-inep.sql                      # local
--
-- ⚠ Deleting a page CASCADES its quiz_questions, quiz_attempts and simulado_review_flags
-- (and sets profiles.last_page_id to NULL). Once students have answered these, rolling back
-- erases that history — export it first if it matters.
--
-- The site_content rows (simcol.*) are KEPT: the GERAL cards read them, and the Simulados
-- Gerais card stays. Revert the code (lib/simulado-collections.ts) to drop the collection.
-- Scope is the exact slug pattern; the 60D Simulado 100Q and every other page are untouched.
-- run-sql.js wraps the file in one transaction (so no BEGIN/COMMIT here).

-- review state has no FK to quiz_questions — clean it explicitly, before the cascade.
DELETE FROM review_schedule
WHERE item_type = 'quiz_question'
  AND item_id IN (
    SELECT q.id FROM quiz_questions q JOIN pages p ON p.id = q.page_id
    WHERE p.slug ~ '^pegada-inep-[0-9]+$'
      AND p.view = 'simulados' AND p.specialty_id IS NULL AND p.content_module_id IS NULL
  );

DELETE FROM pages
WHERE slug ~ '^pegada-inep-[0-9]+$'
  AND view = 'simulados' AND type = 'h5p-quiz' AND specialty_id IS NULL AND content_module_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pages WHERE slug ~ '^pegada-inep-[0-9]+$') THEN
    RAISE EXCEPTION 'pegada-inep pages still present — rollback aborted';
  END IF;
END $$;
