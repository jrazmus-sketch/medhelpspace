-- Scope clarity: state plainly that MedHelpSpace prepares the Revalida 1ª etapa
-- (prova teórica) and does NOT cover the 2ª etapa (estações práticas / presencial).
-- Surgical upsert of only the two touched keys so it won't clobber any other
-- inline-edited landing copy already in production.
--   node scripts/run-sql.js seed-landing-scope-1a-etapa.sql
-- Both strings stay inline-editable in admin edit mode afterwards.

INSERT INTO site_content (key, value) VALUES
  ('hero.eyebrow', $$1ª etapa do Revalida · prova teórica$$),
  ('transp.scope', $$Transparência total: o foco aqui é a 1ª etapa — a prova teórica, onde a maioria reprova. A 2ª etapa (estações práticas) é presencial e tem preparação própria; o MedHelpSpace não cobre essa parte.$$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
