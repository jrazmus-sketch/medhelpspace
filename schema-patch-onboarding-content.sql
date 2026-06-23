-- schema-patch-onboarding-content.sql
--
-- Promotes the new-member walkthrough strings (coachmark + guide tip
-- title/body/review note, and the guide H1) into `site_content` so they become
-- inline-editable via "Edição rápida" / EditableText, exactly like the landing
-- copy. Each editable string is one row, keyed `onboarding.<tip>.<field>`.
--
-- Depends on schema-patch-site-content.sql (the site_content table + RLS +
-- the site_content.value entry in updateScalarField's allowlist already exist).
-- This patch only seeds rows; no DDL.
--
-- Values MUST match the hardcoded fallbacks in app/src/lib/onboarding/tips.ts
-- verbatim (including the **bold** / *italic* markers and curly quotes), so the
-- text is identical whether served from the DB or the fallback. The `**`/`*`
-- markers are rendered by <Emphasis>; admins editing inline see/keep them.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING preserves any edits on re-run.
--
-- Rollback:
--   DELETE FROM site_content WHERE key LIKE 'onboarding.%';

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- Welcome card (dashboard) + guide "Visão geral"
  ('onboarding.welcome.title',  'Bem-vindo ao MedHelpSpace'),
  ('onboarding.welcome.body',   'Há duas formas de estudar: escolha um **tipo** de conteúdo (questões, flashcards, resumos, áudios…) ou entre direto numa **especialidade** e veja tudo dela reunido. O cartão *Continuar* sempre te traz de volta de onde parou.'),
  ('onboarding.welcome.review', 'Tudo que você pratica entra automaticamente na **Revisão** e volta na hora certa para fixar na memória.'),

  -- Dashboard: study-type grid
  ('onboarding.dash-study-types.title', 'Escolha como estudar'),
  ('onboarding.dash-study-types.body',  'Cada modalidade cobre **todas as especialidades**: Praticar (Questões, Flashcards), Ler (Resumos, Revalida Up) ou Ouvir (MedVoice, AudioCards). Escolha o tipo e depois a especialidade.'),

  -- Dashboard: specialty grid
  ('onboarding.dash-specialties.title', 'Estude por especialidade'),
  ('onboarding.dash-specialties.body',  'Prefere focar num tema? Entre numa especialidade e encontre **todo o conteúdo dela** — questões, resumos, áudios e mais — em um só lugar.'),

  -- Specialty hub
  ('onboarding.specialty-hub.title', 'Tudo desta especialidade'),
  ('onboarding.specialty-hub.body',  'Aqui estão os tipos de conteúdo disponíveis para esta especialidade. Escolha por onde começar — você alterna entre eles quando quiser pelo menu **Estudar**.'),

  -- Track / view hub
  ('onboarding.type-hub.title', 'Escolha a especialidade'),
  ('onboarding.type-hub.body',  'Este é o índice deste tipo de conteúdo, com todas as especialidades. Selecione uma para começar.'),

  -- Quiz
  ('onboarding.quiz.title',  'Como funcionam as questões'),
  ('onboarding.quiz.body',   'Uma questão por vez, com **correção e comentário** logo após responder. No fim, dá para refazer só as que você errou.'),
  ('onboarding.quiz.review', 'Cada questão respondida entra na **Revisão**. Errou? Ela volta amanhã em “Só as que errei”.'),

  -- Flashcards
  ('onboarding.flashcards.title',  'Como funcionam os flashcards'),
  ('onboarding.flashcards.body',   'Toque para virar o cartão e ver a resposta. Depois, marque com honestidade se **errou** ou **acertou**.'),
  ('onboarding.flashcards.review', 'Sua autoavaliação alimenta a **Revisão**: acertou, o cartão demora mais para voltar; errou, ele volta logo.'),

  -- Resumos / text lessons
  ('onboarding.lesson.title',  'Como ler os resumos'),
  ('onboarding.lesson.body',   'Use o índice lateral para navegar entre as seções e o botão “Próxima seção” para avançar. Onde houver, marque cada seção como **concluída** ao terminar.'),
  ('onboarding.lesson.review', 'Resumos não entram na Revisão — fixe o conteúdo praticando as **questões e flashcards** do mesmo tema.'),

  -- MedVoice / AudioCards
  ('onboarding.audio.title',  'Como usar os áudios'),
  ('onboarding.audio.body',   'Ouça por seção, com controles de avançar e voltar 15s. O áudio acompanha o texto, então você pode **ler enquanto escuta**.'),
  ('onboarding.audio.review', 'Os AudioCards alimentam a Revisão como os flashcards, assim que os áudios estiverem disponíveis.'),

  -- MemoreCards
  ('onboarding.memorecards.title',  'Como usar os MemoreCards'),
  ('onboarding.memorecards.body',   'Cartões de memorização para revisão rápida dentro do MedHelp 60D. Avance pelo conjunto no seu ritmo.'),
  ('onboarding.memorecards.review', 'Ao terminar um conjunto, ele entra num ciclo de **releitura espaçada** na Revisão (em 7, 21, 60 e 120 dias).'),

  -- Revalida Up
  ('onboarding.revalida-up.title', 'Como usar o Revalida Up'),
  ('onboarding.revalida-up.body',  'Os padrões que mais caem na prova, em formato de **recordação ativa**: tente lembrar o PADRÃO antes de revelar. É a sua decisão estratégica para os pontos de maior retorno.'),

  -- Revisão
  ('onboarding.revisao.title',  'Sua central de Revisão'),
  ('onboarding.revisao.body',   'Aqui voltam, na hora certa, as questões e flashcards que você já estudou. **Revisar hoje** traz o que está no ponto; **Só as que errei** recupera os erros; **Pontos fracos** foca nas especialidades mais frágeis.'),
  ('onboarding.revisao.review', 'O número ao lado de *Revisão* no menu mostra quantos itens estão prontos para hoje.'),

  -- Plano
  ('onboarding.plano.title',  'Seu plano de estudos'),
  ('onboarding.plano.body',   'Um roteiro diário montado a partir das suas metas e do seu desempenho, com **links diretos** para o próximo conteúdo. Pode pausar quando precisar — ele se reajusta.'),
  ('onboarding.plano.review', 'O plano já prioriza as suas revisões pendentes do dia.'),

  -- MedHelp 60D
  ('onboarding.medhelp-60d.title', 'O que é o MedHelp 60D'),
  ('onboarding.medhelp-60d.body',  'Módulo de revisão intensiva que **abre sozinho** nos últimos ~60 dias antes da sua prova. Reúne a Fórmula MedHelp, os MemoreCards e os Simulados 100Q. Não é preciso fazer nada — o cadeado se solta na data certa.'),

  -- Navegação
  ('onboarding.nav.title', 'Como navegar'),
  ('onboarding.nav.body',  'No menu **Estudar** você acessa os seis tipos de conteúdo. Use a **busca** para achar qualquer tema, o **sino** para avisos, e o número na **Revisão** mostra o que revisar hoje. No celular, tudo isso fica na barra inferior.'),

  -- Guide page header
  ('onboarding.guide.h1', 'Como usar a plataforma')
ON CONFLICT (key) DO NOTHING;

COMMIT;
