-- schema-patch-move-gastro-cirurgia-revalida-up.sql
--
-- Data fix (no DDL). Re-files 5 Revalida Up topics from Gastroenterologia
-- (specialty_id=5) to Cirurgia Geral (specialty_id=13). Requested by Karina
-- ("Revalida Up Update", 2026-09-13) as the FIRST step, before the v2 content
-- replacement — the v2 files already carry these five under cirurgia-geral, so
-- this patch also keeps the live section consistent with the incoming import.
--
--   90061  Câncer Colorretal Revalida UP
--   90063  Câncer de Esôfago Revalida UP
--   90126  Hemorragia Digestiva Revalida UP
--   90164  Pancreatite Revalida UP
--   90212  Tumor de Pâncreas Revalida UP
--
-- Revalida Up renders its per-specialty topic cards purely by query
-- (view='revalida-up' AND specialty_id = <spec>); it does NOT use nav_items.
-- Verified zero nav_items reference any revalida-up page, so the specialty_id
-- update is the entire move — breadcrumbs (type-first/derived), the "Ver toda X"
-- link, and the dashboard grouping all follow specialty_id automatically. No user
-- progress is affected: lesson_completions key on page_id (unchanged), and the
-- 165 topic_content (study plan) links key on page_id too. content_module_id is
-- NULL on both source and target, so gating is untouched. No slug collision with
-- existing Cirurgia Geral revalida-up pages (verified on prod and local; the five
-- ids are identical in both databases).
--
-- Idempotent: the guard `AND specialty_id = 5` makes a re-run a no-op.
-- Reversible: see the Rollback block at the bottom.
-- Precedent: schema-patch-move-emergencia-trauma-to-cirurgia.sql (same pattern).

BEGIN;

-- ── Re-file the 5 GI topics: Gastroenterologia (5) → Cirurgia Geral (13) ──
UPDATE pages
SET specialty_id = 13, updated_at = now()
WHERE id IN (90061, 90063, 90126, 90164, 90212)
  AND slug IN (
    'cancer-colorretal-revalida-up',
    'cancer-de-esofago-revalida-up',
    'hemorragia-digestiva-revalida-up',
    'pancreatite-revalida-up',
    'tumor-de-pancreas-revalida-up'
  )
  AND view = 'revalida-up'
  AND specialty_id = 5;

-- ── Verification ──
-- Expect: 5 rows now under Cirurgia Geral (13), 0 of these left in Gastro (5).
SELECT specialty_id, count(*) AS gi_revalida_up_pages
FROM pages
WHERE id IN (90061, 90063, 90126, 90164, 90212)
GROUP BY specialty_id;

-- Expect: gastroenterologia 6, cirurgia-geral = previous count + 5.
SELECT s.slug, count(p.id) AS revalida_up_topics
FROM pages p JOIN specialties s ON s.id = p.specialty_id
WHERE p.view = 'revalida-up' AND p.status = 'publish' AND s.id IN (5, 13)
GROUP BY s.slug
ORDER BY s.slug;

COMMIT;

-- ── Rollback (manual) ──
-- Restores the 5 topics to Gastroenterologia:
--
--   UPDATE pages
--   SET specialty_id = 5, updated_at = now()
--   WHERE id IN (90061, 90063, 90126, 90164, 90212)
--     AND specialty_id = 13;
