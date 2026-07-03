-- seed-loja-card-additions.sql
--
-- New editable copy for the /loja purchase cards:
--   * loja.included.flashcards — the new "Flashcards" feature line. List keys are
--     decoupled from array order (see INCLUDED in app/src/app/loja/page.tsx), so
--     existing rows keep their positional keys (loja.included.0…8) and this new
--     item uses a stable slug key — inserted mid-list without shifting any binding.
--   * loja.card.validity — the access-term line under each cohort name
--     ("Válido até a data da prova"): access is exam-cycle, not lifetime.
--
-- The cards render the <SiteText> fallbacks until these rows exist; seeding them
-- makes both lines editable via "Edição rápida".
--
-- Requires schema-patch-site-content.sql (creates `site_content`). Idempotent:
-- ON CONFLICT (key) DO NOTHING preserves any prior edit on re-run.
--
-- Run:      node scripts/run-sql.js seed-loja-card-additions.sql
-- Rollback: DELETE FROM site_content
--             WHERE key IN ('loja.included.flashcards', 'loja.card.validity');

BEGIN;

INSERT INTO site_content (key, value) VALUES
  ('loja.included.flashcards', 'Flashcards — revisão ativa por especialidade com repetição espaçada'),
  ('loja.card.validity',       'Válido até a data da prova')
ON CONFLICT (key) DO NOTHING;

COMMIT;
