-- schema-patch-simulado-drip-phases-3-4.sql
--
-- Simulado 100Q funnel — cohort intelligence (Phase 3) + the rebuilt follow-up
-- sequence (Phase 4). Design: docs/simulado-drip-design.md §3–§5.
-- Handoff this implements: docs/handoff-simulado-drip.md.
--
-- What this does:
--
--   1. leads.sim_sales_step — how many SALES/value emails a lead has received.
--      The sequence now tracks three positions instead of one: drip_step is the
--      ladder rung (and the reserve-first claim token that stops double sends),
--      sim_reminder_step counts finish nudges, sim_sales_step counts the sales
--      spine. Conflating them made "one spine, different on-ramps" unexpressible.
--
--   2. leads.target_cohort validated against the LIVE cohorts table instead of a
--      hardcoded slug allowlist. The old CHECK listed four slugs, so the day a
--      new turma was created in the admin panel every funnel silently rejected
--      leads who picked it and filed them under the fallback turma — a
--      segmentation bug that only shows up months later as mail about the wrong
--      exam.
--
--      WHY A TRIGGER AND NOT A FOREIGN KEY: 'undecided' is a sentinel, not a
--      turma — it has no cohorts row and must not have one (a fake cohort would
--      surface in the admin Turmas list, in the storefront queries and in the
--      module-unlock trigger). A real FK would reject it. The trigger enforces
--      exactly the intended rule: any cohorts.slug, or the sentinel. The one
--      thing an FK would have given us for free — surviving a slug rename — is
--      handled by the cascade trigger in (3).
--
--   3. Renaming a cohorts.slug now cascades into leads.target_cohort and
--      leads.previous_target_cohort. Before this, a rename orphaned every lead
--      pointing at the old slug: they kept a string nothing resolves, which
--      reads downstream as "unknown turma, no date, sell them anything".
--
--   4. Eight new email templates for the sequence (finish-3, the four sales
--      rungs, the content-only suppression email, the turma question, and the
--      post-exam rollover notice).
--
--      The INSERT block below was GENERATED from EMAIL_TEMPLATE_DEFAULTS so the
--      DB and the code fallback cannot drift:
--        node scripts/gen-email-template-seed.js lead-sim-finish-3 lead-sim-sales-1 \
--          lead-sim-sales-2 lead-sim-sales-3 lead-sim-sales-4 lead-sim-valor \
--          lead-sim-turma lead-sim-rollover
--      ON CONFLICT DO NOTHING: an existing row is somebody's edited copy, so
--      re-running this patch never overwrites edited email copy.
--
-- NOT touched: the five existing lead-sim-* templates. They were rewritten for
-- the v2 product in b4733c4 and are factually correct — the sequence extends
-- them, it does not replace them.
--
-- Idempotent — safe to re-run. Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-simulado-drip-phases-3-4.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-simulado-drip-phases-3-4.sql
-- After the local run: NOTIFY pgrst, 'reload schema' (service-role selects on a
-- new column fail silently otherwise).
--
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS cohorts_slug_rename_cascade ON cohorts;
--   DROP FUNCTION IF EXISTS cohorts_cascade_slug_rename();
--   DROP TRIGGER IF EXISTS leads_target_cohort_valid ON leads;
--   DROP FUNCTION IF EXISTS leads_validate_target_cohort();
--   ALTER TABLE leads ADD CONSTRAINT leads_target_cohort_check
--     CHECK (target_cohort IN ('revalida-2026-2','revalida-2027-1','revalida-20272','undecided'));
--   ALTER TABLE leads DROP COLUMN IF EXISTS sim_sales_step;
--   DELETE FROM email_templates WHERE kind IN ('lead-sim-finish-3','lead-sim-sales-1',
--     'lead-sim-sales-2','lead-sim-sales-3','lead-sim-sales-4','lead-sim-valor',
--     'lead-sim-turma','lead-sim-rollover');
--
-- NOTE: run-sql.js wraps the whole file in one transaction (atomic all-or-nothing),
-- so no explicit BEGIN/COMMIT here.

-- ── 1) Sales-spine counter ───────────────────────────────────────────────────
-- previous_target_cohort is repeated from schema-patch-leads-previous-cohort.sql
-- so this patch stands alone: it was applied to production but not to the local
-- stack, and the trigger below reads the column.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sim_sales_step SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS previous_target_cohort TEXT;

COMMENT ON COLUMN leads.sim_sales_step IS
  'Simulado funnel: how many sales/value emails this lead has received. Owned by the simulado-drip cron; advanced only on a successful send.';

-- ── 2) target_cohort: live-table validation, not a hardcoded allowlist ───────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_target_cohort_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_previous_target_cohort_check;

CREATE OR REPLACE FUNCTION leads_validate_target_cohort()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER: leads is written by the service role today, but a future
-- RLS-scoped writer must still be able to validate against cohorts.
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.target_cohort IS NOT NULL
     AND NEW.target_cohort <> 'undecided'
     AND NOT EXISTS (SELECT 1 FROM cohorts WHERE slug = NEW.target_cohort)
  THEN
    RAISE EXCEPTION 'leads.target_cohort % is not a cohorts.slug (nor the undecided sentinel)', NEW.target_cohort
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.previous_target_cohort IS NOT NULL
     AND NEW.previous_target_cohort <> 'undecided'
     AND NOT EXISTS (SELECT 1 FROM cohorts WHERE slug = NEW.previous_target_cohort)
  THEN
    RAISE EXCEPTION 'leads.previous_target_cohort % is not a cohorts.slug', NEW.previous_target_cohort
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE EXECUTE ON FUNCTION leads_validate_target_cohort() FROM anon, authenticated;

DROP TRIGGER IF EXISTS leads_target_cohort_valid ON leads;
CREATE TRIGGER leads_target_cohort_valid
  BEFORE INSERT OR UPDATE OF target_cohort, previous_target_cohort ON leads
  FOR EACH ROW EXECUTE FUNCTION leads_validate_target_cohort();

-- ── 3) Slug renames cascade into leads (what the FK would have given us) ─────
CREATE OR REPLACE FUNCTION cohorts_cascade_slug_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    UPDATE leads SET target_cohort = NEW.slug WHERE target_cohort = OLD.slug;
    UPDATE leads SET previous_target_cohort = NEW.slug WHERE previous_target_cohort = OLD.slug;
  END IF;
  RETURN NEW;
END $fn$;

REVOKE EXECUTE ON FUNCTION cohorts_cascade_slug_rename() FROM anon, authenticated;

DROP TRIGGER IF EXISTS cohorts_slug_rename_cascade ON cohorts;
CREATE TRIGGER cohorts_slug_rename_cascade
  AFTER UPDATE OF slug ON cohorts
  FOR EACH ROW EXECUTE FUNCTION cohorts_cascade_slug_rename();

-- ── 4) The eight new templates (generated — see the header) ──────────────────
-- lead-sim-finish-3 — [Lead] Simulado — última chamada para terminar
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-finish-3',
  '[Lead] Simulado — última chamada para terminar',
  'Terceiro e último lembrete de conclusão. Sem cupom: o argumento é que nada expira.',
  'Seu simulado não expira (mas eu paro de lembrar)',
  '',
  'Seu simulado continua aberto',
  '<p style="margin:0 0 16px;">{{greeting}}{{progressLine}} Este é o último lembrete que vou mandar sobre terminar — não quero ocupar sua caixa de entrada com isso.</p>
<p style="margin:0 0 16px;">Nada expira. Seu progresso fica salvo e este mesmo link funciona daqui a uma semana ou daqui a três meses, sempre exatamente de onde você parou.</p>
<p style="margin:0 0 20px;">Quando entregar, você recebe o <strong>desempenho nas cinco grandes áreas</strong> e o <strong>gabarito comentado das 100 questões</strong> — inteiro, de graça.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Continuar meu simulado →',
  '{{accessUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"progressLine","description":"Frase de progresso montada pelo sistema. NUNCA traz nota nem desempenho por área."},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.5
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-sales-1 — [Lead] Simulado — venda 1 (sem diagnóstico)
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-sales-1',
  '[Lead] Simulado — venda 1 (sem diagnóstico)',
  'Primeira mensagem de venda para quem NÃO entregou a prova. Sem cupom: constrói valor antes de pedir. Nunca cita nota nem desempenho.',
  'O que separa quem passa de quem quase passa',
  '',
  'O simulado é o diagnóstico. O resto é o tratamento.',
  '<p style="margin:0 0 16px;">{{greeting}}Você já viu de perto como a banca escreve: o nível das questões, o tipo de pegadinha, o tamanho do enunciado. {{progressLine}} Seu simulado continua aberto, sem prazo.</p>
<p style="margin:0 0 16px;">Só que fazer questão solta não muda nota. O que muda é revisar o que mais cai, na ordem certa, e voltar no que você errou <em>antes</em> de esquecer. {{urgencyLine}}</p>
<p style="margin:0 0 20px;">É exatamente isso que a plataforma faz: milhares de <strong>questões comentadas</strong> no mesmo padrão, simulados da banca, <strong>flashcards com revisão espaçada</strong>, resumos, MedVoice para estudar no trânsito — e um plano de estudos que decide por você o que estudar hoje.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Conhecer a plataforma →',
  '{{checkoutUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"progressLine","description":"Frase de progresso montada pelo sistema. NUNCA traz nota nem desempenho por área."},{"tag":"urgencyLine","description":"Frase de urgência montada a partir da data da prova da turma do lead. Vazia quando não há data confirmada — sempre use no fim de um parágrafo."},{"tag":"cohortName","description":"Nome da turma do lead (ex.: ''Revalida 2027.1'')"},{"tag":"examDate","description":"Data da prova (ex.: ''15/01/2027''). Vazia enquanto a banca não confirma."},{"tag":"daysUntilTest","description":"Dias até a prova. Vazio se a data não está confirmada."},{"tag":"checkoutUrl","description":"Link de checkout/loja"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.6
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-sales-2 — [Lead] Simulado — venda 2 (cupom, sem diagnóstico)
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-sales-2',
  '[Lead] Simulado — venda 2 (cupom, sem diagnóstico)',
  'Segunda mensagem de venda para quem NÃO entregou a prova: entrega o cupom de boas-vindas. Nunca cita nota nem desempenho.',
  'Separei um cupom de {{couponPercent}} pra você',
  '',
  'Seu desconto de boas-vindas',
  '<p style="margin:0 0 16px;">{{greeting}}Quem começa um simulado de 100 questões inéditas num sábado à noite não está brincando. {{urgencyLine}}</p>
<p style="margin:0 0 16px;">Separei um cupom de boas-vindas: <strong>{{coupon}}</strong> — {{couponPercent}} de desconto na plataforma completa.</p>
<p style="margin:0 0 20px;">Dentro tem questões comentadas por área e por tema, simulados no padrão da banca, flashcards com revisão espaçada, resumos, MedVoice e um plano de estudos que vai até o dia da sua prova.</p>
<p style="margin:0 0 8px;">Seu simulado continua salvo: <a href="{{accessUrl}}" style="color:#7a1d91;">voltar de onde parei</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Aproveitar {{couponPercent}} →',
  '{{checkoutUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: ''10%'')"},{"tag":"urgencyLine","description":"Frase de urgência montada a partir da data da prova da turma. Vazia quando não há data confirmada."},{"tag":"cohortName","description":"Nome da turma do lead"},{"tag":"examDate","description":"Data da prova. Vazia enquanto a banca não confirma."},{"tag":"daysUntilTest","description":"Dias até a prova. Vazio se a data não está confirmada."},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.7
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-sales-3 — [Lead] Simulado — venda 3 (plano até a prova)
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-sales-3',
  '[Lead] Simulado — venda 3 (plano até a prova)',
  'Terceira mensagem de venda, enviada a TODOS (entregaram ou não). Foco no plano de estudos e na data da prova.',
  'O plano até o dia da sua prova',
  '',
  'A parte difícil não é querer estudar',
  '<p style="margin:0 0 16px;">{{greeting}}A parte difícil nunca é querer estudar. É decidir <em>o que</em> estudar hoje, com o tempo que sobrou do plantão. {{urgencyLine}}</p>
<p style="margin:0 0 16px;">O plano de estudos da plataforma existe para tirar essa decisão de você: ele parte do que mais cai no Revalida, cruza com o que você errou, e entrega a tarefa do dia. Você abre e estuda.</p>
<p style="margin:0 0 20px;">Seu cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) continua valendo.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Ver a plataforma com {{couponPercent}} →',
  '{{checkoutUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: ''10%'')"},{"tag":"urgencyLine","description":"Frase de urgência montada a partir da data da prova da turma. Vazia quando não há data confirmada."},{"tag":"cohortName","description":"Nome da turma do lead"},{"tag":"examDate","description":"Data da prova. Vazia enquanto a banca não confirma."},{"tag":"daysUntilTest","description":"Dias até a prova. Vazio se a data não está confirmada."},{"tag":"phase","description":"Fase da preparação (distante / preparacao / reta-final / vespera)"},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.8
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-sales-4 — [Lead] Simulado — venda 4 (última)
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-sales-4',
  '[Lead] Simulado — venda 4 (última)',
  'Última mensagem da sequência, enviada a TODOS. Encerra o assunto sem drama e sem prazo falso.',
  'Último e-mail sobre isso',
  '',
  'Fico por aqui',
  '<p style="margin:0 0 16px;">{{greeting}}Este é o último e-mail que mando sobre a plataforma. Se não for a hora, tudo bem — de verdade. {{urgencyLine}}</p>
<p style="margin:0 0 16px;">Seu simulado continua aberto e o <strong>gabarito comentado das 100 questões</strong> é seu quando você entregar. Sem pegadinha, sem prazo.</p>
<p style="margin:0 0 20px;">Se quiser seguir com a gente até a prova, seu cupom <strong>{{coupon}}</strong> ({{couponPercent}}) ainda está de pé.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Garantir minha vaga →',
  '{{checkoutUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"coupon","description":"Código do cupom de boas-vindas da turma"},{"tag":"couponPercent","description":"Percentual do cupom (ex.: ''10%'')"},{"tag":"urgencyLine","description":"Frase de urgência montada a partir da data da prova da turma. Vazia quando não há data confirmada."},{"tag":"cohortName","description":"Nome da turma do lead"},{"tag":"examDate","description":"Data da prova. Vazia enquanto a banca não confirma."},{"tag":"daysUntilTest","description":"Dias até a prova. Vazio se a data não está confirmada."},{"tag":"checkoutUrl","description":"Link de checkout com o cupom aplicado"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.9
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-valor — [Lead] Simulado — conteúdo, sem oferta
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-valor',
  '[Lead] Simulado — conteúdo, sem oferta',
  'Enviado quando a venda está suspensa (turma fora de venda, ou prova em menos de 30 dias). Só conteúdo: nunca cupom, nunca checkout.',
  'O que fazer com o tempo que falta',
  '',
  'Reta final é revisar, não começar',
  '<p style="margin:0 0 16px;">{{greeting}}{{urgencyLine}}</p>
<p style="margin:0 0 16px;">Uma coisa que a gente vê todo ciclo: nas últimas semanas muita gente tenta abrir assunto novo — e é justamente aí que a nota cai. O que rende agora é revisar o que já passou pelos seus olhos e treinar questão no formato da banca.</p>
<p style="margin:0 0 16px;">Três coisas que valem mais do que qualquer matéria nova neste momento: <strong>refazer o que você errou</strong>; <strong>revisar as cinco grandes áreas na proporção em que elas caem</strong>; e dormir. Sério — prova de múltipla escolha é lida com o cérebro descansado.</p>
<p style="margin:0 0 20px;">Seu simulado continua aberto, sem prazo, e o gabarito comentado das 100 questões é seu quando entregar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Voltar ao meu simulado →',
  '{{accessUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"urgencyLine","description":"Frase de urgência montada a partir da data da prova da turma. Vazia quando não há data confirmada."},{"tag":"cohortName","description":"Nome da turma do lead"},{"tag":"examDate","description":"Data da prova. Vazia enquanto a banca não confirma."},{"tag":"daysUntilTest","description":"Dias até a prova. Vazio se a data não está confirmada."},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.91
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-turma — [Lead] Simulado — qual é a sua prova?
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-turma',
  '[Lead] Simulado — qual é a sua prova?',
  'Enviado a quem marcou ''Ainda não decidi''. Um toque responde e o lead entra na sequência com data.',
  'Rápido: para qual prova você está estudando?',
  '',
  'Uma pergunta só',
  '<p style="margin:0 0 16px;">{{greeting}}Quando você começou o simulado, marcou que ainda não tinha decidido a prova. Faz diferença: não quero te mandar conteúdo de reta final se a sua prova é ano que vem — nem o contrário.</p>
<p style="margin:0 0 16px;">Qual é a sua próxima prova? É um toque:</p>
{{turmaOptions}}
<p style="margin:16px 0 20px;">{{progressLine}} Seu simulado continua salvo, sem limite de tempo.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Continuar meu simulado →',
  '{{accessUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"turmaOptions","description":"Bloco de botões de turma (um clique responde). Montado pelo sistema a partir das turmas ativas."},{"tag":"progressLine","description":"Frase de progresso montada pelo sistema. NUNCA traz nota nem desempenho por área."},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.92
)
ON CONFLICT (kind) DO NOTHING;

-- lead-sim-rollover — [Lead] Simulado — prova passou, turma ajustada
INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, active, sort_order)
VALUES (
  'lead-sim-rollover',
  '[Lead] Simulado — prova passou, turma ajustada',
  'Enviado quando a data da prova da turma do lead já passou. Informa a nova turma e oferece a correção em um clique.',
  'Ajustei a sua turma (a prova já passou)',
  '',
  'E agora, qual é a próxima?',
  '<p style="margin:0 0 16px;">{{greeting}}A data da <strong>{{previousCohortName}}</strong> já passou. Como não faz sentido continuar te mandando preparação para uma prova que já aconteceu, movi você para a <strong>{{cohortName}}</strong>. {{urgencyLine}}</p>
<p style="margin:0 0 16px;">Se essa não for a sua próxima prova, me diga qual é — leva um toque: <a href="{{turmaUrl}}" style="color:#7a1d91;">escolher outra turma</a>.</p>
<p style="margin:0 0 20px;">E se você prestou a prova: torcemos muito por você. Seu simulado continua aberto do jeito que estava.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>',
  'Escolher minha turma →',
  '{{turmaUrl}}',
  '[{"tag":"greeting","description":"Saudação pré-montada (ex.: ''Oi, Maria! '' ou vazio)"},{"tag":"previousCohortName","description":"Turma anterior, cuja prova já passou"},{"tag":"cohortName","description":"Nova turma para a qual o lead foi movido"},{"tag":"examDate","description":"Data da nova prova. Vazia enquanto a banca não confirma."},{"tag":"urgencyLine","description":"Frase de urgência da NOVA turma. Vazia quando não há data confirmada."},{"tag":"turmaUrl","description":"Link de um clique para escolher outra turma"},{"tag":"accessUrl","description":"Link mágico para retomar o simulado"},{"tag":"unsubscribeUrl","description":"Link de cancelamento (one-click)"}]'::jsonb,
  true,
  14.93
)
ON CONFLICT (kind) DO NOTHING;

-- Post-apply sanity check (read-only):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='leads' AND column_name='sim_sales_step';
--   SELECT tgname FROM pg_trigger WHERE tgname IN
--     ('leads_target_cohort_valid','cohorts_slug_rename_cascade');
--   SELECT kind, active, sort_order FROM email_templates
--     WHERE kind LIKE 'lead-sim-%' ORDER BY sort_order;   -- expect 13 rows
