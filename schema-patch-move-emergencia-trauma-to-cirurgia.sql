-- schema-patch-move-emergencia-trauma-to-cirurgia.sql
--
-- Data fix (no DDL). Re-files 5 Revalida Up trauma topics that were imported
-- under Emergência (specialty_id=3) but belong to Cirurgia Geral (specialty_id=13).
-- They were in the wrong source folder during the Revalida Up (CaiuNaProva) import.
--
--   90205  Trauma Abdominal e Pélvico Revalida UP
--   90206  Trauma – Atendimento Inicial e Vias Aéreas Revalida UP
--   90207  Trauma de Tórax Revalida UP
--   90208  Trauma Raquimedular Revalida UP
--   90209  Traumatismo Cranioencefálico Revalida UP
--
-- Revalida Up renders its per-specialty topic cards purely by query
-- (view='revalida-up' AND specialty_id = <spec>); it does NOT use nav_items.
-- Verified zero nav_items reference these 5 pages, so the specialty_id update is
-- the entire move — breadcrumbs (type-first/derived), the "Ver toda X" link, and
-- the dashboard grouping all follow specialty_id automatically. No user progress
-- is affected: lesson_completions key on page_id (unchanged) and there are 0
-- review_schedule rows for these pages. content_module_id is NULL on both source
-- and target, so gating is untouched.
--
-- Idempotent: the guard `AND specialty_id = 3` makes a re-run a no-op.
-- Reversible: see the Rollback block at the bottom.
-- Audit confirming the misfiling is isolated to these 5 (no other view/track/
-- content type affected): scratch/audit-emergencia-surgical.js.

BEGIN;

-- ── Re-file the 5 trauma topics: Emergência (3) → Cirurgia Geral (13) ──
UPDATE pages
SET specialty_id = 13, updated_at = now()
WHERE id IN (90205, 90206, 90207, 90208, 90209)
  AND specialty_id = 3;

-- ── Verification ──
-- Expect: 5 rows now under Cirurgia Geral, 0 trauma revalida-up left in Emergência.
SELECT specialty_id, count(*) AS trauma_revalida_up_pages
FROM pages
WHERE id IN (90205, 90206, 90207, 90208, 90209)
GROUP BY specialty_id;

SELECT s.slug, count(p.id) AS revalida_up_topics
FROM pages p JOIN specialties s ON s.id = p.specialty_id
WHERE p.view = 'revalida-up' AND p.status = 'publish' AND s.id IN (3, 13)
GROUP BY s.slug
ORDER BY s.slug;

COMMIT;

-- ── Rollback (manual) ──
-- Restores the 5 topics to Emergência:
--
--   UPDATE pages
--   SET specialty_id = 3, updated_at = now()
--   WHERE id IN (90205, 90206, 90207, 90208, 90209)
--     AND specialty_id = 13;
