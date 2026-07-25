-- Simulado 100Q v2 — copy reset for the rebuilt funnel.
--
-- WHY THIS OVERWRITES INSTEAD OF PRESERVING:
-- the v1 sim.* rows describe a product we no longer ship. They promise "100
-- questões REAIS do INEP (2020–2025)", "5 blocos de 20", "correção na hora" and a
-- member-gated gabarito. The v2 funnel serves 100 QUESTÕES INÉDITAS in INEP style,
-- interleaved like the real caderno, with NO feedback during the exam and the full
-- commented gabarito free on completion. Leaving those rows in place would keep
-- false claims live on a public, indexed page, so the changed keys are force-updated
-- (DO UPDATE) rather than the usual DO NOTHING.
--
-- Keys that no longer have a render site are deleted outright, so Karina's visual
-- editor doesn't show her copy that goes nowhere.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-v2-content.sql
--   local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js ...

-- ── Retire v1-only keys ──────────────────────────────────────────────────────
-- sim.session.*        the old per-question feedback UI (no feedback exists now)
-- sim.report.*         the old report + locked-comentário pitch (Phase 2 reseeds)
-- sim.gate.sent_*      the "check your inbox" step (the exam now starts immediately)
-- sim.gate.headline / sim.gate.cohort_*  the old two-step gate
DELETE FROM site_content
WHERE key LIKE 'sim.session.%'
   OR key LIKE 'sim.report.%'
   OR key LIKE 'sim.gate.sent_%'
   OR key IN ('sim.gate.headline', 'sim.gate.cohort_body', 'sim.gate.cohort_eyebrow', 'sim.gate.cohort_title');

-- ── v2 copy ──────────────────────────────────────────────────────────────────
INSERT INTO site_content (key, value) VALUES

  -- Hero
  ('sim.topbar.label',        'Revalida · 1ª etapa'),
  ('sim.hero.badge',          'Grátis · 100 questões inéditas · sem cartão'),
  ('sim.hero.title_1',        'Simulado Revalida gratuito com'),
  ('sim.hero.title_accent',   '100 questões inéditas'),
  ('sim.hero.title_2',        '.'),
  ('sim.hero.subhead',        'Treine com questões no estilo da prova do INEP, revise as cinco grandes áreas e use o gabarito comentado para compreender seus erros e direcionar melhor seus estudos.'),
  ('sim.hero.stat_label',     'questões inéditas'),
  ('sim.hero.stat',           'Questões elaboradas para avaliar raciocínio clínico, interpretação e escolha da conduta mais adequada — no nível e no formato da 1ª etapa.'),

  -- "O que você vai receber"
  ('sim.get.0',               '100 questões inéditas no estilo da 1ª etapa'),
  ('sim.get.1',               'Clínica Médica, Cirurgia, Pediatria, GO e Saúde Coletiva'),
  ('sim.get.2',               'Gabarito com comentários sobre todas as alternativas'),
  ('sim.get.3',               'Sem limite de tempo — seu progresso fica salvo'),

  -- Composition
  ('sim.blocos.eyebrow',      'No formato da prova'),
  ('sim.blocos.title',        'As cinco grandes áreas da 1ª etapa'),
  ('sim.blocos.body',         'As questões vêm misturadas, como no caderno oficial — você não sabe de antemão a área de cada uma, e reconhecer isso faz parte da prova. O peso de cada área acompanha o da 1ª etapa.'),

  -- How it works
  ('sim.how.eyebrow',         'Como funciona'),
  ('sim.how.title',           'Cadastre-se, resolva, revise'),
  ('sim.how.step1_title',     'Cadastre-se'),
  ('sim.how.step1',           'Informe nome, e-mail e para qual Revalida você estuda. A prova começa na hora, sem espera — e o link de retorno vai para o seu e-mail.'),
  ('sim.how.step2_title',     'Resolva'),
  ('sim.how.step2',           'Responda as 100 questões sem limite de tempo, como na prova real: sem ver acertos e erros durante o simulado. Pode parar e voltar quando quiser.'),
  ('sim.how.step3_title',     'Revise'),
  ('sim.how.step3',           'Ao entregar, veja seu desempenho nas cinco grandes áreas e o gabarito comentado de todas as questões — por que a certa está certa e onde cada alternativa erra.'),

  -- Final CTA
  ('sim.final.title',         'Descubra hoje a sua distância real da aprovação.'),
  ('sim.final.body',          '100 questões inéditas, desempenho por grande área e gabarito comentado. Grátis, sem cartão — e você começa agora mesmo.'),

  -- Gate (single screen, immediate start)
  ('sim.gate.eyebrow',        'Prepare-se para começar'),
  ('sim.gate.title',          'Receba gratuitamente o simulado completo'),
  ('sim.gate.body',           'Informe seus dados para começar agora o simulado com 100 questões inéditas e gabarito comentado.'),
  ('sim.gate.name_label',     'Nome'),
  ('sim.gate.email_label',    'Seu melhor e-mail'),
  ('sim.gate.cohort_label',   'Para qual Revalida você está estudando?'),
  ('sim.gate.cta',            'Começar meu simulado grátis →'),
  ('sim.gate.reassurance',    'Começa agora, direto no navegador. Também enviamos um link para você continuar depois. Seus dados estão seguros e não enviamos spam.'),
  ('sim.gate.resume_title',   'Você já tem um simulado em andamento'),
  ('sim.gate.resume_body',    'Enviamos o link de retorno para {email}. Abra o e-mail para continuar exatamente de onde você parou — seu progresso está salvo.'),

  -- Instructions screen
  ('sim.instructions.eyebrow',        'Revalida · 1ª etapa'),
  ('sim.instructions.intro',          'Leia antes de começar. Este simulado funciona como a prova real — você só vê o resultado no final.'),
  ('sim.instructions.item_questions', '**100 questões objetivas**, uma única alternativa correta em cada uma.'),
  ('sim.instructions.item_time',      '**Sem limite de tempo.** Na prova real você teria cinco horas para estas 100 questões — aqui, faça no seu ritmo.'),
  ('sim.instructions.item_feedback',  '**Você não verá acertos nem erros durante a prova.** O gabarito comentado é liberado quando você entregar.'),
  ('sim.instructions.item_navigation','Pode **pular, voltar, mudar respostas e marcar questões para revisar** — como no caderno de prova.'),
  ('sim.instructions.item_save',      'Seu progresso é **salvo automaticamente**. Pode fechar e voltar depois pelo link que enviamos por e-mail.'),
  ('sim.instructions.item_consult',   'Para o resultado valer alguma coisa, **tente responder sem consultar** resumos ou protocolos.'),
  ('sim.instructions.cta',            'Começar a prova →'),

  -- Exam surface
  ('sim.exam.save_note',      'Seu progresso é salvo automaticamente. Pode fechar quando quiser.'),

  ('sim.footer.copyright',    '© MedHelpSpace')

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- There is no automatic rollback: the v1 strings described a product that no
-- longer exists. To revert, re-run schema-patch-simulado-revalida-content.sql,
-- which reseeds the original sim.* copy.
