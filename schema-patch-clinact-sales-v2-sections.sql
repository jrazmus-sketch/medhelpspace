-- ClinAct sales page v2 — six sections (Karina, 2026-10-08).
--
-- The page went from 14 sections to six: início, os quatro formatos, veja na
-- prática, entenda suas decisões, quatro casos gratuitos, planos. Sections are
-- declared in code (components/clinact/sales/sections.tsx); this table only
-- orders and hides them, so the rows of the eight removed sections are dropped
-- and the six kept ones are renumbered 1..6 in her order. `visible` is kept as
-- it was (all six are visible today; Planos can never be hidden anyway).
--
-- Data only — no schema change. Re-run safe.
--
-- Rollback: re-run the old positions from the pre-v2 layout
--   hero 1, problema 2, competencias 3, casos 4, midia 5, confianca 6,
--   evolucao 7, revisao 8, leve-deste-caso 9, biblioteca 10, gratuitos 11,
--   para-quem 12, o-que-e-nao-e 13 (visible = false), planos 14
-- — only meaningful together with the pre-v2 sections.tsx.

BEGIN;

DELETE FROM site_sections
 WHERE page = 'clinact'
   AND key NOT IN ('hero', 'competencias', 'casos', 'evolucao', 'gratuitos', 'planos');

INSERT INTO site_sections (page, key, visible, position) VALUES
  ('clinact', 'hero',         true, 1),
  ('clinact', 'competencias', true, 2),
  ('clinact', 'casos',        true, 3),
  ('clinact', 'evolucao',     true, 4),
  ('clinact', 'gratuitos',    true, 5),
  ('clinact', 'planos',       true, 6)
ON CONFLICT (page, key) DO UPDATE SET position = EXCLUDED.position, updated_at = now();

COMMIT;
