-- Seed the 6 lead-magnet drip templates into email_templates so they show in the
-- admin editor (/admin/email-templates). Content is IDENTICAL to the code defaults
-- in app/src/lib/email-render.ts (EMAIL_TEMPLATE_DEFAULTS) — that file remains the
-- fallback if a row is absent/inactive. FREE-FUNNEL-BUILD-SPEC.md §7.
--
-- Idempotent: ON CONFLICT (kind) DO NOTHING so admin edits are never clobbered.
-- Run with: node scripts/run-sql.js seed-magnet-email-templates.sql

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  (
    'lead-d0',
    '[Lead] D0 — Entrega do simulado',
    'Enviado no momento da captura: entrega o material, sem pitch.',
    'Seu Simulado Honesto chegou 👇',
    '',
    'Seu material está liberado',
    $body$<p style="margin:0 0 16px;">Aqui está o seu <strong>Simulado Honesto</strong> da 1ª etapa:</p>
<p style="margin:0 0 8px;">🔹 As 15 questões comentadas — <a href="{{magnetUrl}}" style="color:#7a1d91;">retomar de onde parou</a></p>
<p style="margin:0 0 20px;">🔹 Seu baralho de flashcards com revisão espaçada — <a href="{{deckUrl}}" style="color:#7a1d91;">abrir baralho</a></p>
<p style="margin:0 0 8px;">Estuda 15 minutos hoje? É o suficiente pra sentir a diferença de estudar com método.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Abrir meu material →',
    '{{magnetUrl}}',
    '[{"tag":"magnetUrl","description":"Link para o simulado"},{"tag":"deckUrl","description":"Link para o baralho de flashcards"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    14
  ),
  (
    'lead-d1',
    '[Lead] D1 — Diagnóstico honesto',
    'Enviado 1 dia após a captura: o resultado e o que fazer com ele.',
    'Você acertou {{score}}/15. O que isso diz sobre {{examLabel}}.',
    '',
    'Seu resultado e o que fazer com ele',
    $body$<p style="margin:0 0 16px;">Você acertou <strong>{{score}}/15</strong>. A 1ª etapa aprova cerca de 1 em cada 4 — então cada ponto conta.</p>
<p style="margin:0 0 16px;">Pelo seu resultado, seus pontos mais fracos agora são <strong>{{weakSpecialties}}</strong>. A boa notícia: dá pra virar esse jogo, se você revisar as matérias certas, na ordem certa.</p>
<p style="margin:0 0 8px;">Montamos um plano que prioriza exatamente os seus pontos fracos até {{examLabel}}.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Ver meu plano até a prova →',
    '{{checkoutUrl}}',
    '[{"tag":"score","description":"Acertos do lead (0–15)"},{"tag":"weakSpecialties","description":"Especialidades mais fracas (nomes)"},{"tag":"examLabel","description":"Data da prova do cohort (ex.: 13 de setembro)"},{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    15
  ),
  (
    'lead-d2',
    '[Lead] D2 — A conta de reprovar',
    'Enviado 2 dias após a captura: o custo real de reprovar.',
    'A conta que ninguém te mostra',
    '',
    'Quanto custa reprovar',
    $body$<p style="margin:0 0 12px;">Ninguém gosta de fazer essa conta, mas ela importa:</p>
<p style="margin:0 0 6px;">• Taxa da prova: <strong>R$410</strong></p>
<p style="margin:0 0 6px;">• A prova custa <strong>R$4.516</strong> em taxas</p>
<p style="margin:0 0 16px;">• Reprovar e refazer a 2ª fase: <strong>+~R$4.106</strong> — e mais um ano sem poder exercer</p>
<p style="margin:0 0 8px;">O método completo da 1ª etapa custa <strong>R$3.990</strong> — menos do que custa reprovar uma vez.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Conhecer o método completo →',
    '{{checkoutUrl}}',
    '[{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    16
  ),
  (
    'lead-d4',
    '[Lead] D4 — Seu plano está esperando',
    'Enviado 4 dias após a captura: a transformação/o plano.',
    'Seu plano de estudos está esperando',
    '',
    'Seu plano continua aqui',
    $body$<p style="margin:0 0 16px;">Seu plano personalizado até {{examLabel}} continua disponível, com <strong>{{weakSpecialties}}</strong> no topo da fila.</p>
<p style="margin:0 0 16px;">Não é mais conteúdo — é a ordem certa: questões comentadas, flashcards com revisão espaçada e áudio-aulas, distribuídos dia a dia até a prova. Você sempre sabe o que estudar hoje.</p>
<p style="margin:0 0 8px;">Quanto antes você entra, mais tempo de estudo. Esperar custa caro — em dias de revisão.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Desbloquear meu plano completo →',
    '{{checkoutUrl}}',
    '[{"tag":"weakSpecialties","description":"Especialidades mais fracas (nomes)"},{"tag":"examLabel","description":"Data da prova do cohort (ex.: 13 de setembro)"},{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    17
  ),
  (
    'lead-d7',
    '[Lead] D7 — A oferta honesta',
    'Enviado 7 dias após a captura: anti-claim + garantia.',
    'Não prometo aprovação. Prometo isto:',
    '',
    'A oferta mais honesta da categoria',
    $body$<p style="margin:0 0 16px;">Vou ser direto: <strong>não prometo sua aprovação.</strong> Nenhum curso honesto pode.</p>
<p style="margin:0 0 16px;">O que eu prometo é que você vai resolver mais questões comentadas, com revisão espaçada, do que em qualquer cursão de R$10 mil — e se em 7 dias você achar que não é pra você, <strong>devolvo cada centavo, sem perguntas.</strong></p>
<p style="margin:0 0 8px;">Feito pra quem se formou fora. Você já é médico — falta o reconhecimento.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Garantir minha vaga (7 dias de garantia) →',
    '{{checkoutUrl}}',
    '[{"tag":"checkoutUrl","description":"Link de checkout com cupom + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    18
  ),
  (
    'lead-final',
    '[Lead] Final — Última chamada',
    'Enviado na reta final: urgência honesta + desconto último (ULTIMA2026).',
    'Faltam poucas semanas para a 1ª etapa',
    '',
    'Última chamada para a turma 2026.2',
    $body$<p style="margin:0 0 16px;">Faltam poucas semanas para a 1ª etapa (13/09) e a turma 2026.2 já está na reta de estudo.</p>
<p style="margin:0 0 16px;">Como o tempo de estudo até a prova é curto, liberamos a sua condição de reta final — o melhor preço que a gente oferece, só pra quem está nesta lista. É justo dos dois lados: menos tempo, preço menor.</p>
<p style="margin:0 0 8px;">Seu plano está pronto. É só começar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>$body$,
    'Começar agora →',
    '{{checkoutUrl}}',
    '[{"tag":"checkoutUrl","description":"Link de checkout com cupom último + e-mail"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
    19
  )
ON CONFLICT (kind) DO NOTHING;
