-- schema-patch-move-cirurgia-pediatrica-to-pediatria.sql
--
-- Data fix (no DDL). Re-files 1 Revalida Up topic that was imported under
-- Cirurgia Geral (specialty_id=13) but belongs to Pediatria (specialty_id=16).
-- It was in the wrong source folder during the Revalida Up (CaiuNaProva) import
-- (misplacement caught visually on the /app/cirurgia-geral revalida-up hub grid).
--
--   90071  Cirurgia Pediátrica Revalida UP
--
-- Revalida Up renders its per-specialty topic cards purely by query
-- (view='revalida-up' AND specialty_id = <spec>); it does NOT use nav_items.
-- Verified zero nav_items reference this page, so the specialty_id update is
-- the entire move — breadcrumbs (type-first/derived), the "Ver toda X" link, and
-- the dashboard grouping all follow specialty_id automatically. No user progress
-- is affected: lesson_completions key on page_id (unchanged). content_module_id
-- is NULL on both source and target, so gating is untouched. No slug collision
-- with existing Pediatria revalida-up pages.
--
-- Idempotent: the guard `AND specialty_id = 13` makes a re-run a no-op.
-- Reversible: see the Rollback block at the bottom.
-- Precedent: schema-patch-move-emergencia-trauma-to-cirurgia.sql (same pattern).

BEGIN;

-- ── Re-file Cirurgia Pediátrica: Cirurgia Geral (13) → Pediatria (16) ──
UPDATE pages
SET specialty_id = 16, updated_at = now()
WHERE id = 90071
  AND specialty_id = 13;

-- ── Verification ──
-- Expect: 1 row now under Pediatria (16), 0 left under Cirurgia Geral (13).
SELECT specialty_id, count(*) AS cirurgia_pediatrica_revalida_up_pages
FROM pages
WHERE id = 90071
GROUP BY specialty_id;

SELECT s.slug, count(p.id) AS revalida_up_topics
FROM pages p JOIN specialties s ON s.id = p.specialty_id
WHERE p.view = 'revalida-up' AND p.status = 'publish' AND s.id IN (13, 16)
GROUP BY s.slug
ORDER BY s.slug;

COMMIT;

-- ── Rollback (manual) ──
-- Restores the topic to Cirurgia Geral:
--
--   UPDATE pages
--   SET specialty_id = 13, updated_at = now()
--   WHERE id = 90071
--     AND specialty_id = 16;
