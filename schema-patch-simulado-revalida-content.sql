-- schema-patch-simulado-revalida-content.sql
--
-- Seeds all editable copy for the /simulado-revalida funnel (100 questões reais)
-- into `site_content`, so Karina can adjust every ad-copy string in the inline
-- visual editor ("Edição rápida") — landing, gate, session AND report. Each value
-- MUST match the `<SiteText fallback=…>` in the corresponding component verbatim —
-- the component renders the fallback until this patch is applied, then the row
-- makes it click-editable.
--
-- Copy lives in:
--   app/src/app/simulado-revalida/page.tsx          (sim.topbar/hero/get/blocos/how/final/footer.*)
--   app/src/components/magnet/simulado-gate.tsx     (sim.gate.*)
--   app/src/components/magnet/simulado-session.tsx  (sim.session.* + sim.report.*)
--
-- Tokens in `{braces}` (e.g. {email}, {n}) are LIVE VALUES substituted at render
-- time via <SiteText vars={…}> — keep the token in any edit.
--
-- ALSO seeds/re-syncs the 5 simulado email templates into email_templates (content
-- IDENTICAL to the code defaults in app/src/lib/email-render.ts, which is the source
-- of truth + fallback). ON CONFLICT DO UPDATE — a re-run RESETS these lead-sim-*
-- rows to the code content.
--
-- Idempotent. Run with: node scripts/run-sql.js schema-patch-simulado-revalida-content.sql
--
-- Rollback (removes only these rows):
--   DELETE FROM site_content WHERE key LIKE 'sim.%';
--   DELETE FROM email_templates WHERE kind LIKE 'lead-sim-%';

BEGIN;

INSERT INTO site_content (key, value) VALUES
  -- ── Top bar ──────────────────────────────────────────────────────────────────
  ('sim.topbar.label',        'Revalida · 1ª etapa'),

  -- ── Hero ─────────────────────────────────────────────────────────────────────
  ('sim.hero.badge',          'Grátis · 100 questões reais · sem cartão'),
  -- H1 is split into three so the gradient accent phrase stays styled.
  ('sim.hero.title_1',        'Um simulado completo do Revalida, com'),
  ('sim.hero.title_accent',   '100 questões reais'),
  ('sim.hero.title_2',        'da prova.'),
  ('sim.hero.subhead',        'Todas retiradas das provas oficiais do INEP de 2020 a 2025 — nada inventado. 5 blocos de 20 questões por grande área, correção na hora e um relatório que mostra exatamente onde você está perdendo pontos.'),
  ('sim.hero.stat_label',     'questões INEP'),
  ('sim.hero.stat',           'Cada questão traz a identificação da prova de origem (ex.: “Questão 38 · Revalida 2020”). Você treina no nível e no estilo exatos da banca — porque É a banca.'),

  -- ── "What you get" strip (right column, under the gate) ──────────────────────
  ('sim.get.0',               '100 questões reais do Revalida (2020–2025)'),
  ('sim.get.1',               'Correção na hora + relatório por grande área'),
  ('sim.get.2',               'Faça em blocos de 20 — seu progresso fica salvo'),

  -- ── Composition (5 blocos) ───────────────────────────────────────────────────
  ('sim.blocos.eyebrow',      'No formato da prova'),
  ('sim.blocos.title',        '5 blocos de 20 questões, um por grande área'),
  ('sim.blocos.body',         'A 1ª etapa do Revalida cobra as 5 grandes áreas — e o simulado espelha isso. Dentro de cada bloco, as questões cobrem os temas de maior incidência real nas provas, misturando todas as edições de 2020 a 2025.'),

  -- ── How it works ─────────────────────────────────────────────────────────────
  ('sim.how.eyebrow',         'Como funciona'),
  ('sim.how.title',           'Do e-mail ao diagnóstico em 3 passos'),
  ('sim.how.step1_title',     'Receba seu acesso'),
  ('sim.how.step1',           'Deixe seu e-mail e escolha sua prova. O link de acesso chega na hora — e é o mesmo link que salva seu progresso.'),
  ('sim.how.step2_title',     'Faça no seu ritmo'),
  ('sim.how.step2',           'Responda os 5 blocos no seu ritmo, com correção na hora. Pode parar quando quiser: o simulado continua de onde você parou.'),
  ('sim.how.step3_title',     'Receba o relatório'),
  ('sim.how.step3',           'Ao final, veja seu desempenho por grande área e descubra exatamente quais áreas priorizar até a prova.'),

  -- ── Final CTA band ───────────────────────────────────────────────────────────
  ('sim.final.title',         'Descubra hoje a sua distância real da aprovação.'),
  ('sim.final.body',          '100 questões reais, correção na hora e relatório por área. Deixe seu e-mail e o link chega em segundos — sem cartão, sem pegadinha.'),

  -- ── Footer ───────────────────────────────────────────────────────────────────
  ('sim.footer.copyright',    '© MedHelpSpace'),

  -- ── Gate (step 1: email) ─────────────────────────────────────────────────────
  ('sim.gate.eyebrow',        'Grátis · sem cartão'),
  ('sim.gate.headline',       'Para onde enviamos o seu simulado?'),
  ('sim.gate.cta',            'Começar meu simulado grátis →'),
  ('sim.gate.reassurance',    'Sem spam. Você recebe o simulado e pode cancelar quando quiser.'),

  -- ── Gate (step 2: turma) ─────────────────────────────────────────────────────
  ('sim.gate.cohort_eyebrow', 'Última etapa'),
  ('sim.gate.cohort_title',   'Para qual prova você está estudando?'),
  ('sim.gate.cohort_body',    'Assim personalizamos o seu relatório de desempenho e os lembretes.'),

  -- ── Gate (step 3: sent) — {email} is the masked address, substituted live ────
  ('sim.gate.sent_title',     'Enviamos seu acesso!'),
  ('sim.gate.sent_body',      'O link do seu simulado de 100 questões foi para {email}. Abra o e-mail e toque em “Começar meu simulado” para iniciar.'),
  ('sim.gate.sent_resume',    '💾 Guarde esse e-mail: você pode fazer o simulado em blocos de 20 e voltar de onde parou pelo mesmo link, quando quiser.'),
  ('sim.gate.sent_spam',      'Não chegou em 2 minutos? Verifique a caixa de spam ou promoções — e marque como “não é spam” para receber os próximos.'),

  -- ── Session — {n} = questões no bloco, substituted live ──────────────────────
  ('sim.session.bloco_intro',      '{n} questões reais do Revalida. Responda no seu ritmo — seu progresso fica salvo a cada resposta e você pode voltar pelo mesmo link.'),
  ('sim.session.feedback_correct', '✓ Você acertou.'),
  ('sim.session.feedback_wrong',   '✗ Não foi dessa vez — o gabarito está marcado em verde.'),
  ('sim.session.locked_note',      'O comentário completo desta questão está disponível na plataforma.'),
  ('sim.session.resume_note',      'Seu progresso fica salvo a cada resposta. Pode fechar quando quiser — o mesmo link do e-mail te traz de volta.'),

  -- ── Report ───────────────────────────────────────────────────────────────────
  ('sim.report.eyebrow',          'Seu relatório de desempenho'),
  ('sim.report.context',          'Todas as questões são de provas reais do Revalida (INEP, 2020–2025). Seu desempenho aqui é o retrato mais honesto da sua distância até a aprovação.'),
  ('sim.report.areas_label',      'Desempenho por grande área'),
  ('sim.report.priority_prefix',  'Prioridade de estudo:'),
  ('sim.report.priority_suffix',  '— foi onde você deixou mais pontos na mesa.'),
  ('sim.report.locked_eyebrow',   'Comentários completos'),
  ('sim.report.locked_body',      'Cada uma dessas 100 questões tem um comentário completo na plataforma: por que a resposta certa está certa, por que cada alternativa erra, e o que a banca queria testar. É assim que um erro vira ponto na próxima prova.'),
  ('sim.report.pitch_eyebrow',    'O próximo passo'),
  ('sim.report.pitch_title',      'Transforme esse diagnóstico em aprovação'),
  ('sim.report.pitch_body',       'A plataforma completa tem milhares de questões comentadas, simulados no padrão da banca, flashcards e AudioCards com revisão espaçada, resumos, MedVoice e um plano de estudos que prioriza exatamente as áreas onde você mais errou — ajustado até a data da sua prova.')
ON CONFLICT (key) DO NOTHING;

-- ── Email templates (content = code defaults in email-render.ts) ────────────────

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  (
    'lead-sim-access',
    '[Lead] Simulado — link de acesso',
    'Funil do simulado (100 questões reais): entrega o link mágico ao escolher a turma.',
    'Seu simulado com 100 questões reais do Revalida está pronto 📝',
    '',
    'Seu simulado está pronto',
    $body$<p style="margin:0 0 16px;">{{greeting}}Aqui está o seu simulado com <strong>100 questões reais</strong> das provas do Revalida (INEP, 2020 a 2025) — 5 blocos de 20 questões, um por grande área, com correção na hora.</p>
<p style="margin:0 0 16px;">Não precisa fazer tudo de uma vez: seu progresso fica salvo a cada resposta, e <strong>este mesmo link</strong> te traz de volta exatamente de onde você parou.</p>
<p style="margin:0 0 20px;">Ao final, você recebe um relatório de desempenho por grande área — o retrato mais honesto da sua distância até a aprovação.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Você recebeu este e-mail porque pediu o simulado em medhelpspace.com.br. Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Começar meu simulado →',
    '{{accessUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"accessUrl","description":"Link mágico de acesso ao simulado (token; retoma o progresso)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14
  ),
  (
    'lead-sim-d2',
    '[Lead] Simulado D2 — cupom de boas-vindas',
    '1 dia após terminar o simulado: recapitula o resultado + cupom para a plataforma.',
    'Seus {{score}}/100 no simulado — e o próximo passo',
    '',
    'Do diagnóstico à aprovação',
    $body$<p style="margin:0 0 16px;">{{greeting}}Você fez <strong>{{score}}/100</strong> no simulado com questões reais do Revalida. Agora você sabe exatamente onde está perdendo pontos — e é aí que a plataforma entra.</p>
<p style="margin:0 0 16px;">Lá dentro, cada uma daquelas 100 questões tem <strong>comentário completo</strong> (por que a certa está certa e por que cada alternativa erra), além de milhares de outras questões comentadas, simulados no padrão da banca, flashcards com revisão espaçada e um plano de estudos que prioriza as áreas onde você mais errou.</p>
<p style="margin:0 0 16px;">Pra dar o próximo passo, separei um cupom de boas-vindas: <strong>{{coupon}}</strong> — {{couponPercent}} de desconto.</p>
<p style="margin:0 0 8px;">Quer rever seu relatório? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu simulado</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Usar meu cupom de {{couponPercent}} →',
    '{{checkoutUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"score","description":"Nota final no simulado (0–100)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: '10%')"},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link para reabrir o simulado/relatório"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14.1
  ),
  (
    'lead-sim-d5',
    '[Lead] Simulado D5 — última chamada',
    '3 dias após terminar o simulado: último lembrete do cupom de boas-vindas.',
    'Ainda dá tempo — {{couponPercent}} na plataforma completa',
    '',
    'Um simulado mostra o problema. A plataforma resolve.',
    $body$<p style="margin:0 0 16px;">{{greeting}}Fazer simulado é o primeiro passo — mas o que aprova é o que você faz com o resultado: revisar as áreas certas, com questões comentadas e constância até a prova.</p>
<p style="margin:0 0 16px;">É exatamente isso que a plataforma faz por você. Seu cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) ainda está de pé.</p>
<p style="margin:0 0 8px;">Quer rever seu desempenho? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu relatório</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Garantir minha vaga com {{couponPercent}} →',
    '{{checkoutUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: '10%')"},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link para reabrir o simulado/relatório"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14.2
  ),
  (
    'lead-sim-finish-1',
    '[Lead] Simulado — continue (lembrete 1)',
    'Enviado a quem não terminou o simulado (+1 dia): volte e continue de onde parou.',
    'Seu simulado do Revalida está te esperando',
    '',
    'Continue de onde você parou',
    $body$<p style="margin:0 0 16px;">{{greeting}}Você começou seu simulado com questões reais do Revalida, mas ainda faltam <strong>{{questionsLeft}} questões</strong> — e o seu progresso está salvo, esperando você voltar.</p>
<p style="margin:0 0 16px;">É só continuar pelo <strong>mesmo link</strong>. Cada bloco tem 20 questões — dá pra avançar um bloco por dia e terminar com o relatório completo por grande área.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Continuar meu simulado →',
    '{{accessUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"questionsLeft","description":"Quantas questões faltam para terminar"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado (resume o progresso)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14.3
  ),
  (
    'lead-sim-finish-2',
    '[Lead] Simulado — continue + cupom (lembrete 2)',
    'Enviado a quem não terminou o simulado (+3 dias): termine + cupom de boas-vindas.',
    'Faltam {{questionsLeft}} questões — e um cupom pra você',
    '',
    'Termine seu simulado (e leve um desconto)',
    $body$<p style="margin:0 0 16px;">{{greeting}}Seu simulado continua salvo — faltam <strong>{{questionsLeft}} questões</strong> para você ter o relatório completo por grande área. Vale a pena: é o diagnóstico mais honesto de onde você está.</p>
<p style="margin:0 0 16px;">E um empurrãozinho pra ir além do diagnóstico: o cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) na plataforma completa — questões comentadas, simulados da banca, flashcards e plano de estudos até a sua prova.</p>
<p style="margin:0 0 8px;">Ver a plataforma com desconto: <a href="{{checkoutUrl}}" style="color:#7a1d91;">aproveitar {{couponPercent}}</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Terminar meu simulado →',
    '{{accessUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"questionsLeft","description":"Quantas questões faltam para terminar"},{"tag":"coupon","description":"Código do cupom de boas-vindas (ou FLASH5 p/ indecisos)"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: '5%')"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"checkoutUrl","description":"Link de checkout/loja com o cupom"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14.4
  )
ON CONFLICT (kind) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  subject     = EXCLUDED.subject,
  kicker      = EXCLUDED.kicker,
  headline    = EXCLUDED.headline,
  body_html   = EXCLUDED.body_html,
  cta_label   = EXCLUDED.cta_label,
  cta_href    = EXCLUDED.cta_href,
  variables   = EXCLUDED.variables,
  sort_order  = EXCLUDED.sort_order;

COMMIT;
