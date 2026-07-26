-- MedHelp 60D → "Simulados 100Q": the seven 100-question mock exams.
--
-- The 60D accordion has had a "Simulados 100Q" row since it shipped, but with no
-- page behind it (it expanded to an "em breve" placeholder). This creates the seven
-- pages that section is built around. Simulado 3 is the 100-question set already
-- powering the free funnel at /simulado-revalida; the other six are placeholders
-- until Karina adds their content, and render disabled in the grid.
--
-- WHY view='simulados' AND NOT a new view:
-- the whole member quiz stack keys off it — isSimulado() in the [slug] route picks
-- the simulado player, breadcrumbs resolve "Simulados", and the admin editor lists
-- it. A new view would mean forking all of that. These are separated from the
-- ungated catalogue by content_module_id instead, which ALSO buys the 60D gate for
-- free: the [slug] route already refuses module-gated pages until the cohort's
-- unlock date.
--
-- CONSEQUENCE, and the reason this patch is careful: every query that means "the
-- public simulado catalogue" must now exclude content_module_id = 1, or these seven
-- leak into Estudos por Questão. Handled in geral-simulados-grid.tsx and the
-- countSimulados() helper. Note the existing 341 view='simulados' pages stay at
-- content_module_id IS NULL — do not batch-update them.
--
-- pages.id has no sequence (ids came from the WordPress migration), so the block
-- 91001-91007 is allocated explicitly, well clear of max(id)=90379.
--
-- Run with: node scripts/run-sql.js schema-patch-simulados-100q-60d.sql

INSERT INTO pages (id, slug, title, type, status, view, specialty_id, content_module_id, notes)
VALUES
  (91001, 'simulado-100q-1', 'Simulado 1', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.'),
  (91002, 'simulado-100q-2', 'Simulado 2', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.'),
  (91003, 'simulado-100q-3', 'Simulado 3', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. 100 questões inéditas — mesmo conjunto do funil /simulado-revalida (simulado_questions set_version 2). Sincronizado por scripts/import-simulado-100.js --member-page simulado-100q-3.'),
  (91004, 'simulado-100q-4', 'Simulado 4', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.'),
  (91005, 'simulado-100q-5', 'Simulado 5', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.'),
  (91006, 'simulado-100q-6', 'Simulado 6', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.'),
  (91007, 'simulado-100q-7', 'Simulado 7', 'h5p-quiz', 'publish', 'simulados', NULL, 1,
   'MedHelp 60D · Simulados 100Q. Aguardando conteúdo.')
ON CONFLICT (id) DO UPDATE SET
  slug              = EXCLUDED.slug,
  title             = EXCLUDED.title,
  type              = EXCLUDED.type,
  status            = EXCLUDED.status,
  view              = EXCLUDED.view,
  specialty_id      = EXCLUDED.specialty_id,
  content_module_id = EXCLUDED.content_module_id,
  notes             = EXCLUDED.notes,
  updated_at        = now();

-- Guard: the public catalogue must stay ungated. If this ever returns a row other
-- than the seven above, something batch-tagged the wrong pages.
DO $$
DECLARE leaked int;
BEGIN
  SELECT count(*) INTO leaked
  FROM pages
  WHERE view = 'simulados' AND content_module_id = 1 AND id NOT BETWEEN 91001 AND 91007;
  IF leaked > 0 THEN
    RAISE EXCEPTION 'ABORT: % simulado page(s) outside 91001-91007 are tagged into MedHelp 60D', leaked;
  END IF;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM quiz_questions WHERE page_id BETWEEN 91001 AND 91007;
-- DELETE FROM pages WHERE id BETWEEN 91001 AND 91007;
