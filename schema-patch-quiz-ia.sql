-- schema-patch-quiz-ia.sql
--
-- Wires up navigation for the H5P quiz content ("Questões Revalida"), the
-- second door of the old "Estudo por Questões" hub. All 204 quiz pages
-- already exist with a working QuizRenderer (Phase D) — this patch only
-- adds the hub pages and nav_items so users can reach them.
--
-- Creates:
--   - 17 per-specialty quiz hubs (ids 90016..90032) → /app/{spec}/{spec}-quiz
--   - 1 entry page slug='questoes-revalida' (id 90033) → /app/questoes-revalida
--     (the "Questões Revalida" door from the two-door /app/estudo-por-questoes)
--   - nav_items linking each quiz hub to its quiz pages (filtered to true
--     quizzes — no flashcards, no MedHelp-60D memorecards)
--
-- Companion code changes:
--   - /app/estudo-por-questoes static page (two-door React component)
--   - Dashboard "Estudo por Questões" card href: /app/simulados → /app/estudo-por-questoes
--   - [specialty]/page.tsx VIEW_CONFIG gains a 'quiz' entry so per-specialty
--     pages show a "Questões Revalida" card alongside Simulados/Resumos/Fórmula

BEGIN;

-- ── 1. 17 per-specialty quiz hubs ──
INSERT INTO pages (id, slug, title, type, status, specialty_id, view)
SELECT 90015 + s.id, s.slug || '-quiz', s.name || ' Questões', 'blurb-nav-hub',
       'publish', s.id, 'quiz'
FROM specialties s
ON CONFLICT (id) DO NOTHING;

-- ── 2. Entry page for /app/questoes-revalida ──
INSERT INTO pages (id, slug, title, type, status, view) VALUES
  (90033, 'questoes-revalida', 'Questões Revalida', 'text-lesson', 'publish', 'quiz')
ON CONFLICT (id) DO NOTHING;

-- ── 3. Link each quiz hub to its quiz pages ──
-- Filter: h5p-quiz pages with no track (skip flashcards) and no module (skip
-- 60D memorecards). These are the genuine "Questões Revalida" quizzes.
INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT
  90015 + p.specialty_id AS source_page_id,
  p.id                   AS target_page_id,
  ROW_NUMBER() OVER (PARTITION BY p.specialty_id ORDER BY p.title) AS position,
  p.title                AS label,
  'cards'                AS layout
FROM pages p
WHERE p.type = 'h5p-quiz'
  AND p.specialty_id IS NOT NULL
  AND p.status = 'publish'
  AND p.track_id IS NULL
  AND p.content_module_id IS NULL
ON CONFLICT (source_page_id, position) DO NOTHING;

-- ── 4. Verification ──
-- Quiz hubs: 17 rows, one per specialty, each with > 0 items.
SELECT h.specialty_id, s.name, h.slug AS hub_slug,
       (SELECT COUNT(*) FROM nav_items ni WHERE ni.source_page_id = h.id) AS items
FROM pages h JOIN specialties s ON s.id = h.specialty_id
WHERE h.id BETWEEN 90016 AND 90032
ORDER BY h.specialty_id;

-- Quiz pages with no specialty (should be 0 — all 204 should be assigned)
SELECT COUNT(*) AS orphan_quiz_pages
FROM pages WHERE type = 'h5p-quiz' AND specialty_id IS NULL;

COMMIT;
