-- schema-patch-welcome-meu-plano-2026-11-16-rollback.sql — restores the previous welcome body text.
BEGIN;
UPDATE site_content
   SET value = 'Há duas formas de estudar: escolha um **tipo** de conteúdo (questões, flashcards, resumos, áudios…) ou entre direto numa **especialidade** e veja tudo dela reunido. O cartão *Continuar* sempre te traz de volta de onde parou.',
       updated_at = now()
 WHERE key = 'onboarding.welcome.body' AND value LIKE 'Comece pelo **Meu Plano**%';
COMMIT;
