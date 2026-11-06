-- schema-patch-move-tumores-renais-formula-urologia-rollback.sql
--
-- Exact undo of schema-patch-move-tumores-renais-formula-urologia.sql from its
-- *_bk_trf_20261106 backups (original nav_items id kept), then drops the backups.
-- (pages.updated_at is reset by the pages_updated_at trigger — cosmetic only.)

DO $guard$
BEGIN
  IF to_regclass('public.pages_bk_trf_20261106') IS NULL THEN
    RAISE EXCEPTION 'nothing to roll back (pages_bk_trf_20261106 does not exist)';
  END IF;
END $guard$;

DELETE FROM nav_items
 WHERE source_page_id IN (SELECT id FROM pages WHERE slug IN ('outros-formula', 'urologia-formula'));

UPDATE pages p SET specialty_id = b.specialty_id, parent_id = b.parent_id, updated_at = b.updated_at
  FROM pages_bk_trf_20261106 b WHERE p.id = b.id;

DELETE FROM pages WHERE slug = 'urologia-formula';
DELETE FROM pages WHERE slug = 'outros-formula';

INSERT INTO nav_items OVERRIDING SYSTEM VALUE
  SELECT * FROM nav_items_bk_trf_20261106 b WHERE NOT EXISTS (SELECT 1 FROM nav_items x WHERE x.id = b.id);

DROP TABLE pages_bk_trf_20261106, nav_items_bk_trf_20261106;
