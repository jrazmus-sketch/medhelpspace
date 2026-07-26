-- Simulado landing — copy for the reassurance strip, the report preview and the FAQ.
--
-- The page was accurate but cold: it described a product, asked for name/e-mail/turma
-- above the fold, and showed nothing of what the visitor gets back for 100 questions
-- of their evening. These keys add the three things that were missing — the
-- reassurances that dissolve the "100 questions" intimidation, a preview of the
-- report, and plain answers to the four objections that actually make people leave.
--
-- Karina's approved H1/subhead are deliberately untouched: her Google Ads headlines
-- mirror them, and breaking that message match would cost more than the warmth gains.
--
-- Seeded DO NOTHING — all new keys, so an existing row is always a deliberate edit.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-landing-warmth.sql
--   local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js ...

INSERT INTO site_content (key, value) VALUES

  -- Hero: said where the hesitation happens, not after signup.
  ('sim.hero.re_0',   'Grátis, sem cartão'),
  ('sim.hero.re_1',   'Sem cronômetro'),
  ('sim.hero.re_2',   'Pare e volte quando quiser'),
  ('sim.hero.trust',  'São as mesmas 100 questões que entregamos aos nossos alunos dentro da plataforma. Aqui elas são suas de graça — sem versão reduzida.'),

  -- Report preview: what they get back, before we ask for anything.
  ('sim.preview.eyebrow',            'O que você recebe no final'),
  ('sim.preview.title',              'Um retrato honesto de onde você está'),
  ('sim.preview.body',               'Ao entregar a prova, você vê seu desempenho nas cinco grandes áreas, os temas que merecem revisão e o gabarito comentado das 100 questões — por que a alternativa correta está certa e onde cada uma das outras engana.'),
  -- NOTE: the numbers in this card are illustrative and must stay labelled as an
  -- example. The área totals beside them are read live from the question set.
  ('sim.preview.card_label',         'Exemplo de relatório'),
  ('sim.preview.card_verdict',       '1 ponto abaixo da nota de corte de referência'),
  ('sim.preview.card_comment_label', '+ gabarito comentado'),
  ('sim.preview.card_comment',       'Questão a questão: sua resposta, a alternativa correta, o comentário e o conceito-chave.'),

  -- FAQ: the four objections that actually stop someone on this page.
  ('sim.faq.title', 'Perguntas honestas, respostas diretas'),
  ('sim.faq.q1',    'Preciso pagar alguma coisa?'),
  ('sim.faq.a1',    'Não. O simulado e o gabarito comentado são gratuitos, sem cartão e sem período de teste. Se depois disso você quiser conhecer a plataforma, o convite estará lá — mas o simulado é seu de qualquer forma.'),
  ('sim.faq.q2',    'Quanto tempo leva?'),
  ('sim.faq.a2',    'Na prova real você teria cinco horas para 100 questões. Aqui não há limite de tempo: pode responder dez hoje, vinte amanhã, e terminar na semana que vem.'),
  ('sim.faq.q3',    'Posso parar no meio e voltar depois?'),
  ('sim.faq.a3',    'Pode. Cada resposta é salva automaticamente e enviamos um link por e-mail que te traz de volta exatamente ao ponto em que você parou — no computador ou no celular.'),
  ('sim.faq.q4',    'O que vocês fazem com o meu e-mail?'),
  ('sim.faq.a4',    'Usamos para te enviar o link do seu simulado e, depois, conteúdos sobre a preparação para o Revalida. Nada de spam, e todo e-mail tem um link de cancelamento com um clique.')

ON CONFLICT (key) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM site_content
-- WHERE key IN ('sim.hero.re_0','sim.hero.re_1','sim.hero.re_2','sim.hero.trust')
--    OR key LIKE 'sim.preview.%' OR key LIKE 'sim.faq.%';
