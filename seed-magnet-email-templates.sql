-- Seed / re-sync the 7 lead-funnel templates into email_templates so they show in
-- the admin editor (/admin/email-templates). Content is IDENTICAL to the code
-- defaults in app/src/lib/email-render.ts (EMAIL_TEMPLATE_DEFAULTS) — that file is
-- the source of truth and the fallback when a row is absent/inactive.
--
-- v2 RE-SYNC (2026-07-01): the funnel was rebuilt trust-first (FREE-FUNNEL-V2-SCOPE.md)
-- and the code defaults changed — `lead-d0` became the *delivery* email using
-- {{greeting}}/{{resultUrl}}/{{unsubscribeUrl}} (not the old {{magnetUrl}}/{{deckUrl}}),
-- and a NEW transactional `lead-code` template was added. But the original seed used
-- ON CONFLICT DO NOTHING, so the pre-existing v1 rows in the DB stayed stale and kept
-- OVERRIDING the v2 code defaults (getEmailTemplate prefers the DB row) — the delivery
-- email rendered with empty links. This file now uses ON CONFLICT DO UPDATE so a single
-- re-run brings the DB back in line with the code defaults. NOTE: because of DO UPDATE,
-- re-running RESETS these lead-* rows to the code content — edit funnel copy in the
-- code defaults (or in the admin UI, knowing a re-run will overwrite it).
--
-- Idempotent. Run with: node scripts/run-sql.js seed-magnet-email-templates.sql

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  (
    'lead-code',
    '[Lead] Código de confirmação',
    'Código de 6 dígitos para desbloquear o plano + demonstração de flashcards.',
    '{{code}} é o seu código — MedHelpSpace',
    '',
    'Seu código de confirmação',
    $body$<p style="margin:0 0 16px;">{{greeting}}Use este código para desbloquear seu resultado completo, o plano de estudos e a demonstração de flashcards:</p>
<p style="margin:0 0 20px;text-align:center;">
  <span style="display:inline-block;background:#f9f5ff;border:1px solid #e9d5ff;border-radius:10px;padding:14px 24px;font-size:30px;font-weight:700;letter-spacing:.35em;color:#7a1d91;">{{code}}</span>
</p>
<p style="margin:0 0 8px;">Ele vale por <strong>10 minutos</strong>. Se não foi você que pediu, é só ignorar este e-mail.</p>$body$,
    '',
    '',
    $json$[{"tag":"code","description":"Código de 6 dígitos"},{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"}]$json$::jsonb,
    13
  ),
  (
    'lead-d0',
    '[Lead] Entrega — plano + flashcards',
    'Enviado ao confirmar o código: entrega o plano + flashcards, present tense, sem pitch.',
    'Seu plano de estudos e seus flashcards estão prontos',
    '',
    'Tudo pronto pra você começar',
    $body$<p style="margin:0 0 16px;">{{greeting}}Seu resultado, seu plano de estudos personalizado e sua demonstração de flashcards com revisão espaçada estão aqui:</p>
<p style="margin:0 0 8px;">🔹 Seu plano + resultado completo — <a href="{{resultUrl}}" style="color:#7a1d91;">abrir meu plano</a></p>
<p style="margin:0 0 20px;">🔹 Os flashcards das suas matérias mais fracas, já prontos pra praticar</p>
<p style="margin:0 0 16px;">São <strong>questões reais de provas anteriores</strong> do Revalida, comentadas uma a uma.</p>
<p style="margin:0 0 8px;">Nos próximos dias eu te mando alguns lembretes e o caminho até a prova — mas o material já está todo aqui, sem esperar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Ver meu plano de estudos →',
    '{{resultUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"resultUrl","description":"Link durável do resultado/plano (token)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    14
  ),
  (
    'lead-d1',
    '[Lead] D1 — Diagnóstico honesto',
    'Enviado 1 dia após a captura: o resultado e o que fazer com ele.',
    'Você acertou {{score}}/15. O que isso diz sobre {{examLabel}}.',
    '',
    'Seu resultado e o que fazer com ele',
    $body$<p style="margin:0 0 16px;">{{greeting}}Você acertou <strong>{{score}}/15</strong>. A 1ª etapa aprova cerca de 1 em cada 4 — então cada ponto conta.</p>
<p style="margin:0 0 16px;">Pelo seu resultado, seus pontos mais fracos agora são <strong>{{weakSpecialties}}</strong>. A boa notícia: dá pra virar esse jogo, se você revisar as matérias certas, na ordem certa.</p>
<p style="margin:0 0 8px;">Montamos um plano que prioriza exatamente os seus pontos fracos até {{examLabel}} — ele continua aqui.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Ver meu plano até a prova →',
    '{{resultUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"score","description":"Acertos do lead (0–15)"},{"tag":"weakSpecialties","description":"Especialidades mais fracas (nomes)"},{"tag":"examLabel","description":"Data da prova do cohort (ex.: 13 de setembro)"},{"tag":"resultUrl","description":"Link durável do resultado/plano (token)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    15
  ),
  (
    'lead-d2',
    '[Lead] D2 — A conta de reprovar',
    'Enviado 2 dias após a captura: o custo real de reprovar.',
    'A conta que ninguém te mostra',
    '',
    'Quanto custa reprovar',
    $body$<p style="margin:0 0 12px;">{{greeting}}Ninguém gosta de fazer essa conta, mas ela importa:</p>
<p style="margin:0 0 6px;">• Taxa da prova: <strong>R$410</strong></p>
<p style="margin:0 0 6px;">• A prova custa <strong>R$4.516</strong> em taxas</p>
<p style="margin:0 0 16px;">• Reprovar e refazer a 2ª fase: <strong>+~R$4.106</strong> — e mais um ano sem poder exercer</p>
<p style="margin:0 0 8px;">O método completo da 1ª etapa custa <strong>R$3.990</strong> — menos do que custa reprovar uma vez.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Conhecer o método completo →',
    '{{checkoutUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    16
  ),
  (
    'lead-d4',
    '[Lead] D4 — Seu plano está esperando',
    'Enviado 4 dias após a captura: a transformação/o plano.',
    'Seu plano de estudos está esperando',
    '',
    'Seu plano continua aqui',
    $body$<p style="margin:0 0 16px;">{{greeting}}Seu plano personalizado até {{examLabel}} continua disponível, com <strong>{{weakSpecialties}}</strong> no topo da fila.</p>
<p style="margin:0 0 16px;">Não é mais conteúdo — é a ordem certa: questões comentadas, flashcards com revisão espaçada e áudio-aulas, distribuídos dia a dia até a prova. Você sempre sabe o que estudar hoje.</p>
<p style="margin:0 0 8px;">Quanto antes você entra, mais tempo de estudo. Esperar custa caro — em dias de revisão.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Ver meu plano de estudos →',
    '{{resultUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"weakSpecialties","description":"Especialidades mais fracas (nomes)"},{"tag":"examLabel","description":"Data da prova do cohort (ex.: 13 de setembro)"},{"tag":"resultUrl","description":"Link durável do resultado/plano (token)"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    17
  ),
  (
    'lead-d7',
    '[Lead] D7 — A oferta honesta',
    'Enviado 7 dias após a captura: anti-claim + garantia.',
    'Não prometo aprovação. Prometo isto:',
    '',
    'A oferta mais honesta da categoria',
    $body$<p style="margin:0 0 16px;">{{greeting}}Vou ser direto: <strong>não prometo sua aprovação.</strong> Nenhum curso honesto pode.</p>
<p style="margin:0 0 16px;">O que eu prometo é que você vai resolver mais questões reais comentadas, com revisão espaçada, do que em qualquer cursão de R$10 mil — e se em 7 dias você achar que não é pra você, <strong>devolvo cada centavo, sem perguntas.</strong></p>
<p style="margin:0 0 8px;">Feito pra quem se formou fora. Você já é médico — falta o reconhecimento.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Garantir minha vaga (7 dias de garantia) →',
    '{{checkoutUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    18
  ),
  (
    'lead-final',
    '[Lead] Final — Última chamada',
    'Enviado na reta final: urgência honesta + desconto último (ULTIMA2026).',
    'Faltam poucas semanas para a 1ª etapa',
    '',
    'Última chamada para a turma 2026.2',
    $body$<p style="margin:0 0 16px;">{{greeting}}Faltam poucas semanas para a 1ª etapa (13/09) e a turma 2026.2 já está na reta de estudo.</p>
<p style="margin:0 0 16px;">Como o tempo de estudo até a prova é curto, liberamos a sua condição de reta final — o melhor preço que a gente oferece, só pra quem está nesta lista. É justo dos dois lados: menos tempo, preço menor.</p>
<p style="margin:0 0 8px;">Seu plano está pronto. É só começar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Começar agora →',
    '{{checkoutUrl}}',
    $json$[{"tag":"greeting","description":"Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)"},{"tag":"checkoutUrl","description":"Link de checkout com cupom último + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]$json$::jsonb,
    19
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
