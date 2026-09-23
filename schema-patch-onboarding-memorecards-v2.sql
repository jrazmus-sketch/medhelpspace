-- schema-patch-onboarding-memorecards-v2.sql
--
-- Onboarding copy for MemoreCards v2 (2026-09-22). The tip was written for the
-- legacy section ("Avance pelo conjunto no seu ritmo") and still reads that way
-- on the live site, because the site_content row WINS over tips.ts. This
-- rewrites it for the new viewer (themes in sequence, Próximo / setas / swipe,
-- the Temas list) and updates the one line of the Revisão tip that still called
-- them "conjuntos".
--
-- DO UPDATE on purpose: all four rows still held their original seed text
-- (checked on prod before writing this — no inline edit is overwritten).
-- Mirrors TIPS.memorecards / TIPS.revisao in app/src/lib/onboarding/tips.ts.
--
-- No DDL. Rollback: re-run the values from schema-patch-onboarding-content.sql.

BEGIN;

INSERT INTO site_content (key, value) VALUES
  ('onboarding.memorecards.title',  'Como usar os MemoreCards'),
  ('onboarding.memorecards.body',   'Os pontos-chave de cada tema em cartões visuais, na mesma organização do **Revalida Up**. Escolha a especialidade e avance no seu ritmo — pelo botão **Próximo**, pelas setas do teclado ou deslizando no celular. Quando um tema termina, o seguinte começa em sequência; em **Temas** você vai direto a qualquer um.'),
  ('onboarding.memorecards.review', 'Ao terminar um tema, ele entra num ciclo de **releitura espaçada** na Revisão (em 7, 21, 60 e 120 dias).'),
  ('onboarding.revisao.body',       'Aqui voltam, na hora certa, as questões e flashcards que você já estudou. **Revisar hoje** traz o que está no ponto; **Só as que errei** recupera os erros; **Pontos fracos** foca nas especialidades mais frágeis; e **Reler memorecards** traz de volta os temas dos MemoreCards (MedHelp 60D) na hora da releitura.')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
