-- schema-patch-move-tumores-renais-formula-urologia.sql
--
-- Karina 2026-11-06 (reply in "Reorganização do tema Tumores Renais"): the Fórmula MedHelp
-- Tumores Renais page also moves Nefrologia → Outros → Urologia, like the Resumos one
-- (schema-patch-move-tumores-renais-urologia.sql moved flashcards / Revalida Up / Resumos /
-- Questões earlier the same day).
--
-- Fórmula had no Outros hub (the accordion showed an empty "Outros" placeholder), so this
-- builds the same two levels Resumos has (Outros → Urologia area hub → page):
--   outros-formula   (blurb-nav-hub, specialty outros, parent NULL)        ← top-level hub
--   urologia-formula (blurb-nav-hub, specialty outros, parent outros-formula) ← area hub,
--                    kept out of hub lists by lib/hub-nesting.ts topLevelHubs()
-- Both carry content_module_id = 1: Fórmula is gated in MedHelp 60D, so are its hubs.
-- The page keeps its slug, title, content and 60D gate; only specialty + parent change,
-- and its card moves from nefrologia-formula to urologia-formula.
--
-- Keyed by slug (local and prod ids differ). Backups *_bk_trf_20261106 → exact undo in
-- schema-patch-move-tumores-renais-formula-urologia-rollback.sql.
-- Apply: node scripts/run-sql.js schema-patch-move-tumores-renais-formula-urologia.sql
--        (prod), then with DATABASE_URL=<local> (local).

DO $guard$
DECLARE v int;
BEGIN
  IF to_regclass('public.pages_bk_trf_20261106') IS NOT NULL THEN
    RAISE EXCEPTION 'already applied (pages_bk_trf_20261106 exists)';
  END IF;
  IF EXISTS (SELECT 1 FROM pages WHERE slug IN ('outros-formula', 'urologia-formula')) THEN
    RAISE EXCEPTION 'outros-formula / urologia-formula already exist';
  END IF;
  SELECT count(*) INTO v FROM pages p
   WHERE p.slug = 'tumores-renais-formula' AND p.status = 'publish' AND p.view = 'formula'
     AND p.content_module_id = 1
     AND p.specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia')
     AND p.parent_id = (SELECT id FROM pages WHERE slug = 'nefrologia-formula');
  IF v <> 1 THEN RAISE EXCEPTION 'tumores-renais-formula is not where expected (%)', v; END IF;
  SELECT count(*) INTO v FROM nav_items
   WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'nefrologia-formula')
     AND target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-formula');
  IF v <> 1 THEN RAISE EXCEPTION 'expected 1 nefrologia-formula card, found %', v; END IF;
  SELECT count(*) INTO v FROM nav_items
   WHERE target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-formula');
  IF v <> 1 THEN RAISE EXCEPTION 'expected 1 card pointing at the page in total, found %', v; END IF;
  IF (SELECT id FROM specialties WHERE slug = 'outros') IS NULL THEN
    RAISE EXCEPTION 'specialty outros missing';
  END IF;
END $guard$;

-- Backups (service-role only).
CREATE TABLE pages_bk_trf_20261106 AS
  SELECT * FROM pages WHERE slug = 'tumores-renais-formula';
CREATE TABLE nav_items_bk_trf_20261106 AS
  SELECT * FROM nav_items WHERE target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-formula');
ALTER TABLE pages_bk_trf_20261106 ENABLE ROW LEVEL SECURITY;
ALTER TABLE nav_items_bk_trf_20261106 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pages_bk_trf_20261106, nav_items_bk_trf_20261106 FROM anon, authenticated;

-- 1. The two hubs.
INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, parent_id, wp_created_at, wp_modified_at)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pages), 'outros-formula', 'Outros Formula',
       'blurb-nav-hub'::page_type, 'publish', 'formula'::page_view, 1,
       (SELECT id FROM specialties WHERE slug = 'outros'), NULL, now(), now();

INSERT INTO pages (id, slug, title, type, status, view, content_module_id, specialty_id, parent_id, wp_created_at, wp_modified_at)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pages), 'urologia-formula', 'Urologia Formula',
       'blurb-nav-hub'::page_type, 'publish', 'formula'::page_view, 1,
       (SELECT id FROM specialties WHERE slug = 'outros'),
       (SELECT id FROM pages WHERE slug = 'outros-formula'), now(), now();

INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT (SELECT id FROM pages WHERE slug = 'outros-formula'),
       (SELECT id FROM pages WHERE slug = 'urologia-formula'), 1, 'Urologia', 'cards';

-- 2. The page moves; its card moves with it.
UPDATE pages
   SET specialty_id = (SELECT id FROM specialties WHERE slug = 'outros'),
       parent_id    = (SELECT id FROM pages WHERE slug = 'urologia-formula')
 WHERE slug = 'tumores-renais-formula';

DELETE FROM nav_items
 WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'nefrologia-formula')
   AND target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-formula');

INSERT INTO nav_items (source_page_id, target_page_id, position, label, layout)
SELECT (SELECT id FROM pages WHERE slug = 'urologia-formula'),
       (SELECT id FROM pages WHERE slug = 'tumores-renais-formula'), 1, 'Tumores Renais', 'cards';

-- Post-check.
DO $check$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pages p
   WHERE p.slug = 'tumores-renais-formula' AND p.status = 'publish' AND p.content_module_id = 1
     AND p.specialty_id = (SELECT id FROM specialties WHERE slug = 'outros')
     AND p.parent_id = (SELECT id FROM pages WHERE slug = 'urologia-formula');
  IF v <> 1 THEN RAISE EXCEPTION 'post-check: page not moved'; END IF;
  SELECT count(*) INTO v FROM nav_items
   WHERE target_page_id = (SELECT id FROM pages WHERE slug = 'tumores-renais-formula');
  IF v <> 1 THEN RAISE EXCEPTION 'post-check: % cards point at the page', v; END IF;
  SELECT count(*) INTO v FROM pages p
   WHERE p.view = 'formula' AND p.status = 'publish' AND p.title ILIKE '%tumor%renal%'
     AND p.specialty_id = (SELECT id FROM specialties WHERE slug = 'nefrologia');
  IF v <> 0 THEN RAISE EXCEPTION 'post-check: % Tumores Renais Fórmula pages still in Nefrologia', v; END IF;
  SELECT count(*) INTO v FROM nav_items
   WHERE source_page_id = (SELECT id FROM pages WHERE slug = 'nefrologia-formula');
  IF v <> 5 THEN RAISE EXCEPTION 'post-check: nefrologia-formula has % cards, expected 5', v; END IF;
  IF (SELECT count(*) FROM pages WHERE slug IN ('outros-formula', 'urologia-formula')
        AND content_module_id = 1 AND status = 'publish') <> 2 THEN
    RAISE EXCEPTION 'post-check: hubs missing or not gated';
  END IF;
END $check$;
