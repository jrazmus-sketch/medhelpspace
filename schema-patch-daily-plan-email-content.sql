-- schema-patch-daily-plan-email-content.sql
--
-- Puts the ACTUAL plan inside the "plano do dia" e-mail.
--
-- THE BUG: members opted in to "Receba o plano do dia todo dia de manhã" and got a
-- generic note saying their plan was ready *on the platform* — the e-mail contained
-- no tasks at all, just a greeting and a countdown. The lifecycle cron now derives
-- today's plan per student (lib/study-plan/fetch.ts → getDerivedPlanForUser) and
-- passes it in as two new template variables:
--
--   {{planItems}}    — the day's tasks as an HTML fragment (one table row per item:
--                      title, subtitle, "~N min", linked to the absolute page URL).
--                      Built by renderPlanItemsHtml() in the cron route.
--   {{totalMinutes}} — integer, plan.totalEstimatedMinutes.
--
-- {{displayName}} and {{daysToExamLine}} are unchanged (daysToExamLine now comes
-- through WITHOUT its old leading <br/><br/>, because it closes the intro sentence
-- instead of standing alone — and it is empty until cohorts.date_confirmed is true).
--
-- WHY A PATCH IS REQUIRED: e-mail templates are DB-backed. EMAIL_TEMPLATE_DEFAULTS
-- in app/src/lib/email-render.ts is only the fallback used when no email_templates
-- row exists — and this row DOES exist (seeded by schema-patch-email-templates.sql).
-- Editing the TypeScript alone changes nothing in production; the stored body would
-- keep rendering "Seu plano personalizado está pronto na plataforma." while the cron
-- fills {{planItems}} into a body that never mentions it.
--
-- Idempotent and non-clobbering: the UPDATE is guarded on the stored body NOT already
-- containing {{planItems}}, so re-running is a no-op and an admin who later edits the
-- body in /admin/email-templates (keeping the tag) is never overwritten.
--
-- Apply to BOTH databases:
--   prod:  node scripts/run-sql.js schema-patch-daily-plan-email-content.sql
--   local: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
--            node scripts/run-sql.js schema-patch-daily-plan-email-content.sql
--
-- Rollback (restores the pre-patch body + variables verbatim):
--   UPDATE email_templates SET
--     body_html = 'Seu plano personalizado está pronto na plataforma. Abra para ver as tarefas específicas baseadas no seu desempenho atual.{{daysToExamLine}}',
--     variables = '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"daysToExamLine","description":"Frase opcional com a contagem regressiva da prova (pode vir vazia)"}]'::jsonb
--   WHERE kind = 'daily-plan';
--   (and revert the cron so it stops deriving the plan — a body without {{planItems}}
--    simply drops the tasks again, it does not error.)

BEGIN;

UPDATE email_templates
SET
  body_html = '<p style="margin:0 0 18px;font-size:15px;color:#4b5563;line-height:1.65;">
  Estas são as tarefas que o seu plano recomenda para hoje — cerca de <strong style="color:#111827;">{{totalMinutes}} minutos</strong> de estudo.{{daysToExamLine}}
</p>
{{planItems}}
<p style="margin:18px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
  Marque o que concluir na plataforma — o plano de amanhã se ajusta ao seu ritmo.
</p>',
  variables = '[
    {"tag":"displayName","description":"Primeiro nome do membro"},
    {"tag":"planItems","description":"Lista das tarefas do dia em HTML (título, subtítulo e duração de cada item, com link) — gerada pelo cron a partir do plano derivado"},
    {"tag":"totalMinutes","description":"Tempo estimado total do plano de hoje, em minutos (só o número)"},
    {"tag":"daysToExamLine","description":"Frase opcional com a contagem regressiva da prova (vazia enquanto a banca não confirma a data da turma)"}
  ]'::jsonb
WHERE kind = 'daily-plan'
  AND body_html NOT LIKE '%{{planItems}}%';

COMMIT;

-- Verify:
--   SELECT kind, body_html LIKE '%{{planItems}}%' AS has_items,
--          body_html LIKE '%{{totalMinutes}}%' AS has_minutes
--   FROM email_templates WHERE kind = 'daily-plan';
