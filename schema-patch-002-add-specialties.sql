-- schema-patch-002-add-specialties.sql
--
-- Adds 5 Revalida exam areas that were missing from the initial specialties seed:
-- Cirurgia Geral, Ginecologia, Obstetrícia, Pediatria, Saúde Coletiva
--
-- Effect: ~25 pages gain a specialty_id and become visible in track hubs
-- (medvoice, audiocards, flashcards) and accessible via /app/{spec}/{slug} URLs.
-- These specialties also appear in the dashboard specialty grid.

BEGIN;

-- 1. Add the 5 specialties
INSERT INTO specialties (slug, name, display_order) VALUES
  ('cirurgia-geral',  'Cirurgia Geral',  13),
  ('ginecologia',     'Ginecologia',     14),
  ('obstetricia',     'Obstetrícia',     15),
  ('pediatria',       'Pediatria',       16),
  ('saude-coletiva',  'Saúde Coletiva',  17);

-- 2. Assign specialty_id to all pages for each new specialty
UPDATE pages
SET specialty_id = (SELECT id FROM specialties WHERE slug = 'cirurgia-geral')
WHERE slug LIKE 'cirurgia-geral-%'
  AND specialty_id IS NULL;

UPDATE pages
SET specialty_id = (SELECT id FROM specialties WHERE slug = 'ginecologia')
WHERE slug LIKE 'ginecologia-%'
  AND specialty_id IS NULL;

UPDATE pages
SET specialty_id = (SELECT id FROM specialties WHERE slug = 'obstetricia')
WHERE slug LIKE 'obstetricia-%'
  AND specialty_id IS NULL;

UPDATE pages
SET specialty_id = (SELECT id FROM specialties WHERE slug = 'pediatria')
WHERE slug LIKE 'pediatria-%'
  AND specialty_id IS NULL;

UPDATE pages
SET specialty_id = (SELECT id FROM specialties WHERE slug = 'saude-coletiva')
WHERE slug LIKE 'saude-coletiva-%'
  AND specialty_id IS NULL;

-- 3. Verify counts (should see 5 rows, one per new specialty, each with > 0 pages)
SELECT s.slug, s.display_order, COUNT(p.id) AS page_count
FROM specialties s
LEFT JOIN pages p ON p.specialty_id = s.id
WHERE s.display_order >= 13
GROUP BY s.id, s.slug, s.display_order
ORDER BY s.display_order;

COMMIT;
