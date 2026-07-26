-- Simulado 100Q v2 — rewrite the five funnel e-mails.
--
-- WHY THIS FORCE-UPDATES:
-- the stored rows describe the v1 product and are factually wrong now. The worst
-- is lead-sim-access, which production sends to every new sign-up with the subject
-- "Seu simulado com 100 questões REAIS do Revalida está pronto" — contradicting the
-- landing page the candidate just read. The rest reference "5 blocos de 20",
-- "correção na hora" and a member-gated comentário that no longer exists now the
-- gabarito is free.
--
-- Three substantive changes beyond wording:
--   1. lead-sim-access is no longer a delivery e-mail. The exam starts on-site
--      immediately, so this is the RESUME link and the copy says so.
--   2. {{score}} → {{simScore}} on lead-sim-d2. The quiz funnel's score is out of
--      15 and this one is out of 100; sharing a tag made previews render "7/100".
--   3. {{questionsLeft}} → {{progressLine}} on both non-finisher reminders. The
--      cron builds the sentence, covering "answered all 100 but never submitted"
--      and "below the 50-answer minimum" — cases a bare number renders wrongly
--      ("faltam 0 questões"). Per Karina's rule these reminders carry a progress
--      count ONLY: never a score, never per-área performance, never a comentário.
--
-- Keep in sync with EMAIL_TEMPLATE_DEFAULTS in app/src/lib/email-render.ts.
-- Review rendered output at /admin/email-templates/revisao.
--
-- Run with: node scripts/run-sql.js schema-patch-simulado-v2-emails.sql
--   local:  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node scripts/run-sql.js ...

UPDATE email_templates SET
  name        = '[Lead] Simulado — link para retomar',
  description = 'Funil do simulado (100 questões inéditas): enviado ao iniciar a prova. É o link de retorno, não a entrega — a prova já começou no site.',
  subject     = 'Seu link para voltar ao simulado Revalida 📝',
  headline    = 'Guarde este e-mail',
  body_html   = '<p style="margin:0 0 16px;">{{greeting}}Você começou o simulado com <strong>100 questões inéditas</strong> no estilo da 1ª etapa do Revalida. Este é o seu <strong>link de retorno</strong>: guarde este e-mail.</p>
<p style="margin:0 0 16px;">Não precisa fazer tudo de uma vez. <strong>Não há limite de tempo</strong>, seu progresso é salvo automaticamente e este mesmo link te traz de volta exatamente de onde você parou.</p>
<p style="margin:0 0 20px;">Quando entregar a prova, você recebe o seu <strong>desempenho nas cinco grandes áreas</strong> e o <strong>gabarito comentado das 100 questões</strong> — com o porquê da alternativa correta e onde cada alternativa errada engana.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Você recebeu este e-mail porque começou o simulado em medhelpspace.com.br. Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  cta_label   = 'Voltar ao meu simulado →',
  variables   = '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"accessUrl","description":"Link mágico de retorno ao simulado (token; retoma o progresso)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  updated_at  = now()
WHERE kind = 'lead-sim-access';

UPDATE email_templates SET
  subject   = 'Seus {{simScore}}/100 — e o que fazer com esse resultado',
  body_html = '<p style="margin:0 0 16px;">{{greeting}}Você fez <strong>{{simScore}}/100</strong> no simulado e já viu o gabarito comentado das 100 questões. Agora você sabe onde está perdendo pontos — a pergunta é o que fazer com isso nas semanas que faltam.</p>
<p style="margin:0 0 16px;">É o que a plataforma resolve: <strong>milhares de questões comentadas no mesmo padrão</strong>, simulados da banca, revisão espaçada que devolve na hora certa o que você errou, resumos, MedVoice — e um plano de estudos que ataca primeiro as áreas em que você foi pior neste simulado.</p>
<p style="margin:0 0 16px;">Pra dar o próximo passo, separei um cupom de boas-vindas: <strong>{{coupon}}</strong> — {{couponPercent}} de desconto.</p>
<p style="margin:0 0 8px;">Quer rever seu relatório e o gabarito? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu resultado</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  variables = '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"simScore","description":"Nota final no simulado (0–100)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: ''10%'')"},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link para reabrir o simulado/relatório"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  updated_at = now()
WHERE kind = 'lead-sim-d2';

UPDATE email_templates SET
  body_html = '<p style="margin:0 0 16px;">{{greeting}}Fazer o simulado foi o primeiro passo — mas o que aprova é o que vem depois: revisar as áreas certas, com constância, até a prova.</p>
<p style="margin:0 0 16px;">É exatamente isso que a plataforma faz por você, começando pelas grandes áreas em que você teve mais dificuldade. Seu cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) ainda está de pé.</p>
<p style="margin:0 0 8px;">Quer rever seu desempenho e o gabarito comentado? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu resultado</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  updated_at = now()
WHERE kind = 'lead-sim-d5';

UPDATE email_templates SET
  body_html = '<p style="margin:0 0 16px;">{{greeting}}{{progressLine}} Seu progresso está salvo, e o mesmo link te leva de volta exatamente ao ponto em que você parou.</p>
<p style="margin:0 0 16px;">Sem pressa: <strong>não há limite de tempo</strong>. Dá para responder um punhado de questões por dia, quando der.</p>
<p style="margin:0 0 20px;">Ao entregar a prova, você libera o <strong>desempenho nas cinco grandes áreas</strong> e o <strong>gabarito comentado das 100 questões</strong>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  variables = '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"progressLine","description":"Frase de progresso montada pelo sistema (ex.: ''Você respondeu 68 de 100 questões.''). NUNCA traz nota nem desempenho por área — o diagnóstico só é liberado ao entregar a prova."},{"tag":"accessUrl","description":"Link mágico para retomar o simulado (resume o progresso)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  updated_at = now()
WHERE kind = 'lead-sim-finish-1';

UPDATE email_templates SET
  subject   = 'Termine seu simulado — e leve um cupom',
  body_html = '<p style="margin:0 0 16px;">{{greeting}}{{progressLine}} Continua tudo salvo, sem limite de tempo — e ao entregar você libera o desempenho nas cinco grandes áreas e o <strong>gabarito comentado das 100 questões</strong>.</p>
<p style="margin:0 0 16px;">E um empurrãozinho para ir além do diagnóstico: o cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) na plataforma completa — questões comentadas, simulados no padrão da banca, flashcards com revisão espaçada e plano de estudos até a sua prova.</p>
<p style="margin:0 0 8px;">Ver a plataforma com desconto: <a href="{{checkoutUrl}}" style="color:#7a1d91;">aproveitar {{couponPercent}}</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  variables = '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"progressLine","description":"Frase de progresso montada pelo sistema (ex.: ''Você respondeu 68 de 100 questões.''). NUNCA traz nota nem desempenho por área."},{"tag":"coupon","description":"Código do cupom de boas-vindas (ou FLASH5 p/ indecisos)"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: ''5%'')"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"checkoutUrl","description":"Link de checkout/loja com o cupom"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  updated_at = now()
WHERE kind = 'lead-sim-finish-2';

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- No automatic rollback: the previous copy described a product that no longer
-- exists. Re-running schema-patch-simulado-revalida-content.sql restores the v1
-- templates (that patch reseeds them with DO UPDATE).
