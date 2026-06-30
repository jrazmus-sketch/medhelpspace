-- Landing v2 copy (identity-led positioning + new sections).
-- Idempotent upsert into site_content by key. Apply with:
--   node scripts/run-sql.js seed-landing-copy-v2.sql
-- All copy is also inline-editable afterwards in the admin edit mode.

INSERT INTO site_content (key, value) VALUES
  -- Hero (changed)
  ('hero.eyebrow',   $$1ª etapa do Revalida · prova teórica$$),
  ('hero.headline',  $$Você já é médico.$$),
  ('hero.headline2', $$Falta o Brasil reconhecer.$$),
  ('hero.subhead',   $$Não é curso. Não é videoaula. É o sistema que treina o raciocínio do Revalida — e faz você lembrar dele no dia da prova.$$),

  -- Identity band
  ('identity.eyebrow',   $$A saga pelo CRM$$),
  ('identity.headline1', $$Anos lá fora.$$),
  ('identity.headline2', $$A última prova é aqui.$$),
  ('identity.body',      $$Você encarou a saudade, o preconceito do “diploma de fora”, a faculdade na Bolívia, no Paraguai, na Argentina. Falta só uma coisa: passar numa prova que reprova 3 em cada 4. É pra isso que o MedHelpSpace existe.$$),

  -- System showcase
  ('sys.eyebrow', $$O que está incluído$$),
  ('sys.title1',  $$Um sistema completo.$$),
  ('sys.title2',  $$Não um curso a mais.$$),
  ('sys.questoes.name',    $$Estudo por Questões$$),
  ('sys.questoes.tagline', $$Treine do jeito que a banca cobra.$$),
  ('sys.questoes.body',    $$Questões no estilo INEP com comentário em cada alternativa — a pegadinha, o raciocínio e a conduta que marca ponto. Refaça só as que errou até dominar.$$),
  ('sys.questoes.result',  $$Você treina o que cai, do jeito que cai — e ganha segurança.$$),
  ('sys.resumos.name',     $$Resumos Narrativos$$),
  ('sys.resumos.tagline',  $$Clínica em cena, não teoria solta.$$),
  ('sys.resumos.body',     $$Você acompanha o caso, reconhece o padrão e fecha com a conduta do jeito que cai. No fim: o que a prova quer + checklist de revisão rápida.$$),
  ('sys.resumos.result',   $$Menos decoreba, mais clareza — e mais acertos sob pressão.$$),
  ('sys.medvoice.name',    $$MedVoice$$),
  ('sys.medvoice.tagline', $$Estude de ouvido — no plantão, no ônibus, na madrugada.$$),
  ('sys.medvoice.body',    $$Cenas clínicas em áudio: diagnóstico, pegadinha e conduta entrando na sua cabeça. Com transcrição para ler enquanto ouve.$$),
  ('sys.medvoice.result',  $$Revisão rápida todo dia — resposta mais automática na prova.$$),
  ('sys.flashcards.name',    $$Flashcards$$),
  ('sys.flashcards.tagline', $$5.140 cartões que decidem sozinhos quando voltar.$$),
  ('sys.flashcards.body',    $$Você se autoavalia — “errei” ou “acertei” — e a repetição espaçada cuida do resto. O que você domina espaça; o que você erra volta amanhã.$$),
  ('sys.flashcards.result',  $$Fixação real, não releitura passiva.$$),
  ('sys.revalida-up.name',    $$Revalida Up$$),
  ('sys.revalida-up.tagline', $$Os padrões que mais caem — em recordação ativa.$$),
  ('sys.revalida-up.body',    $$Temas de “caiu na prova” no formato que fixa: a pista aparece, você tenta prever, e só então revela o padrão de prova.$$),
  ('sys.revalida-up.result',  $$Você não lê o padrão — você se lembra dele.$$),

  -- Revisão
  ('revisao.eyebrow',  $$O que ninguém mais tem no Revalida$$),
  ('revisao.headline', $$Quase ninguém é reprovado por não ter estudado. É por ter esquecido.$$),
  ('revisao.body',     $$Toda questão que você responde e todo flashcard que você vira entram numa fila de revisão. A repetição espaçada traz cada conteúdo de volta no momento exato antes de você esquecer — e o que você erra volta primeiro.$$),
  ('revisao.kicker',   $$É a mesma lógica dos cursões de R$6 mil — só que feita para o Revalida e já inclusa.$$),

  -- Plano
  ('plano.eyebrow',  $$Seu plano, sozinho$$),
  ('plano.headline', $$Não precisa decidir por onde começar.$$),
  ('plano.body',     $$Responda 3 perguntas — sua data de prova, suas especialidades mais fracas e quantas horas você tem. O sistema monta um plano diário com link direto para o próximo conteúdo, prioriza o que você precisa revisar e se ajusta sozinho conforme a prova chega.$$),
  ('plano.kicker',   $$Plantão puxado essa semana? Pausa e retoma sem perder o ritmo.$$),

  -- Transparency
  ('transp.eyebrow',  $$Sem pegadinha$$),
  ('transp.headline', $$Uma compra. Sem mensalidade. Sem surpresa no cartão.$$),
  ('transp.p1', $$Sem mensalidade e sem renovação automática$$),
  ('transp.p2', $$Sem “segunda parcela” que aparece um ano depois$$),
  ('transp.p3', $$Sem preço escondido atrás de um consultor$$),
  ('transp.p4', $$7 dias para testar tudo e pedir reembolso, sem justificar$$),
  ('transp.stakes', $$A prova já custa R$4.516 em taxas do INEP. Reprovar e refazer a 2ª etapa custa outros R$4.106. Do lado dessa conta, a preparação certa é o item mais barato — e o único que muda o resultado.$$),
  ('transp.scope',  $$Transparência total: o foco aqui é a 1ª etapa — a prova teórica, onde a maioria reprova. A 2ª etapa (estações práticas) é presencial e tem preparação própria; o MedHelpSpace não cobre essa parte.$$),

  -- MedHelp 60D — post-swap lineup (Fórmula in, Revalida Up moved to day-1)
  ('sixtyd.item1.name', $$Fórmula MedHelp$$),
  ('sixtyd.item1.desc', $$Atalhos de prova: macetes, mnemônicos e frases-chave$$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
