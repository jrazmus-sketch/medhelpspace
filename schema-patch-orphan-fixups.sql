-- schema-patch-orphan-fixups.sql
--
-- Follow-up to schema-patch-orphan-content-repair.sql. Two corrections after
-- cross-referencing pre-existing nav_items (the authoritative old-WP signal
-- I should have checked first):
--
--   1. Delirium (3153) → Neurologia, not Psiquiatria. Old WP nav_item lives
--      on neurologia-formula (3147); my patch incorrectly listed it on
--      psiquiatria-formula (3219). Move specialty and drop the stray nav_item.
--
--   2. Emergências Psiquiátricas (4 pages: 1211, 2178, 3227, 4161) → Psiquiatria,
--      not Emergência. Pre-existing parser bug: the parser substring-matched
--      "emergencia" in the slug and assigned specialty=3 (Emergência). But all
--      pre-existing nav_items come from psiquiatria-* hubs, so the old WP site
--      organized this content under Psiquiatria.
--
-- Updates memory note: project_ambiguous_specialty_placements.md (delirium).

BEGIN;

-- 1. Delirium → Neurologia, drop the duplicate nav_item I added
UPDATE pages SET specialty_id = 9 WHERE id = 3153 AND specialty_id = 11;
DELETE FROM nav_items WHERE source_page_id = 3219 AND target_page_id = 3153;

-- 2. Emergências Psiquiátricas (4 view variants) → Psiquiatria
UPDATE pages SET specialty_id = 11 WHERE id IN (1211, 2178, 3227, 4161) AND specialty_id = 3;

-- Verify: no remaining cross-specialty nav disagreements
SELECT tgt.id, tgt.slug, ms.name AS my_spec, array_agg(DISTINCT hs.name) AS nav_says
FROM pages tgt
JOIN specialties ms ON ms.id = tgt.specialty_id
JOIN nav_items ni ON ni.target_page_id = tgt.id
JOIN pages src ON src.id = ni.source_page_id AND src.type = 'blurb-nav-hub' AND src.specialty_id IS NOT NULL
JOIN specialties hs ON hs.id = src.specialty_id
WHERE ni.source_page_id < 90000
GROUP BY tgt.id, tgt.slug, ms.name
HAVING NOT (ms.name = ANY (array_agg(DISTINCT hs.name)))
ORDER BY tgt.id;

COMMIT;
