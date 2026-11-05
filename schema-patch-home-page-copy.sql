-- MedHelpSpace home page — the two-product chooser at "/" (Karina 2026-11-05,
-- "Página inicial da MedHelpSpace"). Seeds the editable copy so she can change it
-- inline; values = the fallbacks in app/src/app/page.tsx (her card descriptions
-- verbatim; the subtitle is our proposal). Product names stay in code (lockups).
-- footer.copyright already exists (shared with the Revalida footer).
-- Idempotent: ON CONFLICT DO NOTHING never overwrites an inline edit.
-- Rollback: DELETE FROM site_content WHERE key LIKE 'home.%';
INSERT INTO site_content (key, value) VALUES
  ('home.subtitle',     $$Escolha o produto que você quer conhecer.$$),
  ('home.revalida.desc', $$Preparação para o Revalida INEP.$$),
  ('home.revalida.cta',  $$Conhecer$$),
  ('home.clinact.desc',  $$Treino de raciocínio clínico com casos interativos.$$),
  ('home.clinact.cta',   $$Conhecer$$)
ON CONFLICT (key) DO NOTHING;
