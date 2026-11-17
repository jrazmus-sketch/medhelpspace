-- schema-patch-welcome-meu-plano-2026-11-16.sql
-- Karina 2026-11-16 23h15 BRT ("Atualizar boas-vindas e verificar a abrangência do Meu Plano"): the dashboard
-- "Bem-vindo ao MedHelpSpace" card leads with Meu Plano. Body text only — title, Revisão note and buttons unchanged.
-- Paragraph breaks need the TipText whitespace-pre-line change shipped with this text.
-- Guarded on the previous text (an edit made since is never overwritten). Rollback: ...-rollback.sql.
BEGIN;
UPDATE site_content
   SET value = E'Comece pelo **Meu Plano**: defina seus dias e tempo de estudo e receba um cronograma com temas por prioridade para estudar, praticar e revisar.\n\nVocê também pode explorar os materiais por **tipo de conteúdo** — questões, simulados, flashcards, resumos, áudios e outros — ou por **especialidade**.\n\nPara retomar de onde parou, use o cartão **Continuar**.',
       updated_at = now()
 WHERE key = 'onboarding.welcome.body'
   AND value = 'Há duas formas de estudar: escolha um **tipo** de conteúdo (questões, flashcards, resumos, áudios…) ou entre direto numa **especialidade** e veja tudo dela reunido. O cartão *Continuar* sempre te traz de volta de onde parou.';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM site_content WHERE key = 'onboarding.welcome.body' AND value LIKE 'Comece pelo **Meu Plano**%') THEN
    RAISE EXCEPTION 'welcome body is neither the old nor the new text - nothing changed';
  END IF;
END $$;
COMMIT;
