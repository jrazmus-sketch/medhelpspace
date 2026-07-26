-- Simulado 100Q v2 — copy for the result page (Phase 2).
--
-- Structure follows Karina's spec: diagnosis → invitation #1 → commented review of
-- all 100 questions → invitation #2.
--
-- NOTE ON `sim.report.cut_score`: this is a NUMBER, not prose — the reference pass
-- mark of the 1ª etapa, out of 100, used to turn a raw score into a verdict
-- ("faltaram 5 pontos para a nota de corte"). It lives in site_content precisely
-- so Karina can correct it without a deploy: it is a claim about the exam, not
-- about us, and it must stay accurate. Anything unparseable falls back to 60.
--
-- Seeded with DO NOTHING: unlike the v1 copy reset, none of these keys previously
-- existed with wrong values, so an existing row is always an intentional edit.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-v2-report-content.sql
--   local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js ...

INSERT INTO site_content (key, value) VALUES

  ('sim.report.eyebrow',      'Seu relatório de desempenho'),

  -- Cut-score benchmark
  ('sim.report.cut_score',    '60'),
  ('sim.report.cut_above',    'Você ficou {gap} ponto(s) acima da nota de corte de referência do Revalida ({cut}/100). Bom sinal — agora o trabalho é sustentar isso em todas as áreas.'),
  ('sim.report.cut_below',    'Faltaram {gap} ponto(s) para a nota de corte de referência do Revalida ({cut}/100). Essa distância é totalmente recuperável — e o seu desempenho por área mostra exatamente onde ela está.'),

  ('sim.report.areas_label',  'Desempenho por grande área'),

  -- Temas: a revision roadmap, never a verdict. The note is doing real work —
  -- it is what stops a single missed question reading as "you don't know this".
  ('sim.report.temas_label',  'Temas que merecem revisão'),
  ('sim.report.temas_note',   'São os temas das questões que você errou neste simulado. Cada tema aparece poucas vezes na prova, então trate a lista como um roteiro de revisão — não como um diagnóstico definitivo do seu conhecimento.'),

  ('sim.report.start_label',  'Por onde começar'),

  -- Invitation #1 — after the diagnosis, before the review. Soft: a link to the
  -- platform, not a checkout.
  ('sim.report.invite1_eyebrow', 'O próximo passo'),
  ('sim.report.invite1_title',   'Transforme esse diagnóstico em um plano'),
  ('sim.report.invite1_body',    'O MedHelpSpace monta um plano de estudos que prioriza exatamente as áreas em que você teve mais dificuldade, com milhares de questões comentadas, simulados no padrão da banca, resumos, flashcards e MedVoice — ajustado até a data da sua prova.'),
  ('sim.report.invite1_cta',     'Conhecer o MedHelpSpace →'),

  -- Commented review
  ('sim.report.review_title', 'Gabarito comentado'),
  ('sim.report.review_body',  'Todas as 100 questões, com a alternativa correta, por que ela está certa, onde cada alternativa errada engana e o conceito-chave.'),

  -- Invitation #2 — after the review, carrying the actual offer.
  ('sim.report.invite2_eyebrow', 'Continue a partir daqui'),
  ('sim.report.invite2_title',   'Esse nível de comentário, em toda a sua preparação'),
  ('sim.report.invite2_body',    'Você acabou de ver como tratamos 100 questões. Na plataforma são milhares — com simulados no padrão da banca, revisão espaçada, resumos, MedVoice e um plano que ataca primeiro as áreas em que você foi pior neste simulado.'),

  ('sim.report.durable_note', 'Guarde o e-mail que enviamos: o mesmo link traz você de volta a este relatório quando quiser.')

ON CONFLICT (key) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM site_content WHERE key LIKE 'sim.report.%';
