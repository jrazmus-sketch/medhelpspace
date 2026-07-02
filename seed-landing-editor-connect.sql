-- Connect the remaining hardcoded landing sections to the inline editor.
-- Each row promotes one <SiteText> fallback to an editable site_content row.
-- Apply with:
--   node scripts/run-sql.js seed-landing-editor-connect.sql
--
-- Scope (front page `/`):
--   * founder.*      — Founder/identity quote block (was fully hardcoded)
--   * comp.*         — "MedHelpSpace vs. Cursos Tradicionais" table (was hardcoded)
--   * statsnum.*     — the stats strip LABELS (numbers stay live via getLandingStats)
--   * sys.memorecards.* — System-showcase row 04, shipped after seed-landing-copy-v2
--                         so its <SiteText> keys were never seeded (fell back, non-editable)
--   * hero.cta_free  — the secondary "grátis" hero button, added after the v1 seed
--
-- Values MUST match the <SiteText fallback=…> in the components verbatim, so
-- applying this is a no-op visually — it only unlocks inline editing.
--
-- ON CONFLICT DO NOTHING: additive only. Never clobbers an existing key/edit.
-- Rollback: DELETE FROM site_content WHERE key LIKE 'founder.%' OR key LIKE 'comp.%'
--   OR key LIKE 'statsnum.%' OR key LIKE 'sys.memorecards.%' OR key = 'hero.cta_free';

INSERT INTO site_content (key, value) VALUES
  -- Founder / identity quote block
  ('founder.quote',       $$Criar o MedHelpSpace foi uma decisão de repensar o jeito de estudar para o Revalida. Não mais aulas que precisam de 3 horas para dizer o que a prova cobra em 30 segundos. A ideia foi simples:$$),
  ('founder.quote_hl',    $$tirar o excesso, deixar o que cai, e treinar do jeito que a banca pensa.$$),
  ('founder.attr_name',   $$Equipe MedHelpSpace$$),
  ('founder.attr_role',   $$Médicos e especialistas em aprovação no Revalida$$),
  ('founder.stat1_label', $$especialidades cobertas$$),
  ('founder.stat2_label', $$questões comentadas$$),
  ('founder.stat3_label', $$flashcards de fixação$$),

  -- Comparison table — header + per-row copy (keyed by ROWS[].id in the component)
  ('comp.eyebrow',    $$Por que MedHelpSpace?$$),
  ('comp.title_lead', $$MedHelpSpace vs.$$),
  ('comp.title_alt',  $$Cursos Tradicionais$$),
  ('comp.feito.cat', $$Feito para$$),
  ('comp.feito.mhs', $$Feito só para o Revalida — pensado para quem se formou fora$$),
  ('comp.feito.alt', $$Curso de residência adaptado às pressas para o Revalida$$),
  ('comp.fixacao.cat', $$Fixação$$),
  ('comp.fixacao.mhs', $$Repetição espaçada inclusa: o que você erra volta no momento certo$$),
  ('comp.fixacao.alt', $$Você relê o conteúdo e torce para lembrar na prova$$),
  ('comp.direcao.cat', $$Direção$$),
  ('comp.direcao.mhs', $$Um plano diário que se monta sozinho a partir do seu desempenho$$),
  ('comp.direcao.alt', $$Você decide sozinho por onde começar, no meio do volume$$),
  ('comp.formatos.cat', $$Formatos$$),
  ('comp.formatos.mhs', $$Questões · Resumos · Áudios · Flashcards — feitos para o celular$$),
  ('comp.formatos.alt', $$Videoaulas longas, difíceis de consumir no plantão$$),
  ('comp.reta.cat', $$Reta final$$),
  ('comp.reta.mhs', $$MedHelp 60D já incluso — libera sozinho 60 dias antes da prova$$),
  ('comp.reta.alt', $$Módulo de reta final cobrado à parte$$),
  ('comp.cobranca.cat', $$Cobrança$$),
  ('comp.cobranca.mhs', $$Uma compra, sem mensalidade e sem renovação automática$$),
  ('comp.cobranca.alt', $$Assinatura que renova sozinha — e multa para cancelar$$),
  ('comp.garantia.cat', $$Garantia$$),
  ('comp.garantia.mhs', $$7 dias para testar e pedir reembolso, sem precisar justificar$$),
  ('comp.garantia.alt', $$Reembolso travado nas letras miúdas do contrato$$),

  -- Stats strip labels (values are live counts, not editable)
  ('statsnum.flashcards',      $$flashcards$$),
  ('statsnum.questoes',        $$questões comentadas$$),
  ('statsnum.audios',          $$áudios MedVoice$$),
  ('statsnum.audiocards',      $$audiocards$$),
  ('statsnum.especialidades',  $$especialidades$$),

  -- System-showcase row 04 — MemoreCards (shipped after v2 seed)
  ('sys.memorecards.name',    $$MemoreCards$$),
  ('sys.memorecards.badge',   $$incluído no MedHelp 60D$$),
  ('sys.memorecards.tagline', $$O mapa visual que sua memória lembra na prova.$$),
  ('sys.memorecards.body',    $$Cada tema condensado num card visual de alta fixação: o padrão, os sinais e o “grito da prova” numa imagem só. Você folheia, reconhece e grava — a memória visual faz o trabalho pesado.$$),
  ('sys.memorecards.result',  $$O que você vê uma vez, você lembra na hora certa.$$),

  -- Hero secondary CTA (free questions magnet)
  ('hero.cta_free', $$Fazer o simulado grátis$$)
ON CONFLICT (key) DO NOTHING;
