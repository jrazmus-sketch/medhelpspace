-- schema-patch-onboarding-copy-refresh.sql
--
-- Refreshes the new-member walkthrough copy in `site_content` after the study-plan
-- overhaul + recent feature additions. The member-facing coachmarks/guide render
-- the DB value when a row exists (falling back to the hardcoded TIPS in
-- app/src/lib/onboarding/tips.ts only when absent), so editing tips.ts alone does
-- NOT change the live site for already-seeded keys — this patch is what makes the
-- corrected copy actually show. (Same "stale DB row wins" trap as the email
-- templates.)
--
-- Two groups below:
--   1. DO UPDATE — keys already in the DB whose copy drifted from the live app.
--      Verified before writing: every one of these DB rows still holds the ORIGINAL
--      seed text (no admin inline-edits diverged), so overwriting is safe and only
--      corrects stale copy. Notably `onboarding.audio.*` was frozen at the very
--      first seed ("Como usar os áudios" + a review note claiming AudioCards aren't
--      available yet) — now corrected to the MedVoice-specific copy.
--   2. New rows — tips added to tips.ts after the last seed (simulados / roteiro /
--      progresso) that never had DB rows; seeding them keeps DB ↔ fallback in
--      lockstep and makes them inline-editable like the rest.
--
-- Values MUST match the hardcoded fallbacks in app/src/lib/onboarding/tips.ts
-- verbatim (incl. **bold** / *italic* markers and curly quotes), rendered by
-- <Emphasis>. Depends on schema-patch-onboarding-content.sql (table + prior rows).
--
-- Idempotent: safe to re-run (DO UPDATE is deterministic; re-running just re-sets
-- the same values). No DDL.
--
-- Rollback: restore the prior values from schema-patch-onboarding-content.sql
-- (audio/quiz/nav/plano/lesson/revisao/dash-study-types) and
-- schema-patch-audiocards-discovery.sql (audiocards), and drop the new keys:
--   DELETE FROM site_content WHERE key IN (
--     'onboarding.simulados.title','onboarding.simulados.body','onboarding.simulados.review',
--     'onboarding.roteiro.title','onboarding.roteiro.body',
--     'onboarding.progresso.title','onboarding.progresso.body');

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- ── Drift fixes (overwrite stale DB copy) ─────────────────────────────────────

  -- Dashboard study-type grid: no longer three labeled buckets on the dashboard,
  -- and where the grouping does exist (Estudar menu) Revalida Up sits under Praticar.
  ('onboarding.dash-study-types.body',
   'Cada tipo de conteúdo cobre **todas as especialidades**. Você pode **praticar** (Questões, Flashcards, Revalida Up), **ler** (Resumos) ou **ouvir** (MedVoice, AudioCards). Escolha o tipo e depois a especialidade.'),

  -- Quiz: add the "por que errou?" error-classification chips.
  ('onboarding.quiz.body',
   'Uma questão por vez, com **correção e comentário** logo após responder. Errou? Você pode marcar **por que errou** (faltou conteúdo, interpretação, distração…) para o plano entender seus pontos fracos. No fim, dá para refazer só as que você errou.'),

  -- Resumos: primary action button is "Concluir e continuar", not "Próxima seção".
  ('onboarding.lesson.body',
   'Use o índice lateral para navegar entre as seções. Ao terminar cada uma, toque em **“Concluir e continuar”** para marcá-la como concluída e avançar para a próxima.'),

  -- MedVoice: DB was frozen at the original generic/stale seed. Now MedVoice-specific.
  ('onboarding.audio.title',  'Como usar o MedVoice'),
  ('onboarding.audio.body',
   'Treinamento em **áudio** por tema: ouça por seção, com controles de avançar e voltar 15s. Onde houver, toque em **Transcrição** para ler enquanto escuta.'),
  ('onboarding.audio.review',
   'O MedVoice é para escuta — fixe o conteúdo praticando as **questões e flashcards** do mesmo tema.'),

  -- AudioCards: name the third discovery surface (the hub intro banner) too.
  ('onboarding.audiocards.body',
   'São os mesmos cartões dos **Flashcards**, agora em áudio: ouça a pergunta e a resposta de cada tema sem precisar olhar a tela. Toque em **Transcrição do áudio** para ler junto; avance e volte 15s pelos controles. Você encontra os áudios da especialidade logo depois das suas sessões de flashcards, no seu painel e na própria seção de AudioCards — é um apoio opcional, é só ouvir, sem marcar nada.'),

  -- Revisão: hub now has a 4th block, "Reler memorecards".
  ('onboarding.revisao.body',
   'Aqui voltam, na hora certa, as questões e flashcards que você já estudou. **Revisar hoje** traz o que está no ponto; **Só as que errei** recupera os erros; **Pontos fracos** foca nas especialidades mais frágeis; e **Reler memorecards** traz os conjuntos do MedHelp 60D na hora da releitura.'),

  -- Plano: the big one — reflects the overhauled planner (calibration wizard +
  -- email reminders + adjustable schedule), not the old thin "roteiro diário".
  ('onboarding.plano.body',
   'Um cronograma diário montado a partir das suas metas e do seu desempenho. Faça a **calibração rápida** — data da prova, especialidades fracas, horas por semana e os tipos de conteúdo que quer treinar — e o plano organiza o que estudar a cada dia, com **links diretos** para o próximo conteúdo. Ative os **lembretes por email** (resumo semanal e plano do dia) para saber quando e o que estudar. Pode pausar ou ajustar quando precisar — ele se reequilibra sozinho.'),

  -- Navegação: on mobile the search + bell stay in the TOP header; only Estudar +
  -- the Revisão badge live in the bottom bar.
  ('onboarding.nav.body',
   'No menu **Estudar** você acessa os seis tipos de conteúdo. Use a **busca** para achar qualquer tema, o **sino** para avisos, e o número na **Revisão** mostra o que revisar hoje. No celular, a barra inferior traz o **Estudar** e a **Revisão**; a busca e o sino ficam no topo da tela.'),

  -- ── New rows (previously unseeded; render from fallback until now) ─────────────

  ('onboarding.simulados.title',  'Como funcionam os simulados'),
  ('onboarding.simulados.body',
   'Cada simulado é um **treino de prova**: uma questão por vez, com correção e comentário logo após responder — e, ao errar, você pode marcar **por que errou**. Em **Geral** você treina um mix de todas as áreas, como na prova real; em **Por área**, foca numa especialidade. No fim, dá para refazer só as que errou.'),
  ('onboarding.simulados.review',
   'Cada questão respondida entra na **Revisão** e volta na hora certa — errou, ela retorna em “Só as que errei”.'),

  ('onboarding.roteiro.title',  'Seu roteiro de estudos'),
  ('onboarding.roteiro.body',
   'A lista completa dos temas do Revalida, **ordenados pelo que mais cai na prova** (2020–2025) e agrupados por prioridade A→D. Vá de cima para baixo — os temas do topo dão o **maior retorno**. Cada tema mostra se você já **iniciou** ou **dominou**.'),

  ('onboarding.progresso.title',  'Acompanhe sua jornada'),
  ('onboarding.progresso.body',
   'No alto da tela, a barrinha de progresso mostra num relance quanto você já concluiu de todo o conteúdo liberado. Toque nela para abrir **Sua jornada** e ver o detalhe por seção — **Questões, Resumos, MedVoice, Flashcards** e mais.')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
