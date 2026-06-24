-- Email Templates — promote the hardcoded transactional emails (lib/email.ts and
-- the inline copies in api/cron/lifecycle-notifications) to admin-editable DB rows.
--
-- Two tables:
--   email_templates — one row per email "kind"; editable subject + body + CTA.
--   email_settings  — single-row global config: sender, footer (CNPJ/contact/
--                     address), used to render the shared header/footer chrome.
--                     The footer fields exist precisely because the current
--                     footers are incomplete (CNPJ placeholder, no address).
--
-- Access model: neither table is member-facing. The render path (finalize.ts,
-- the lifecycle cron) and the admin UI both read/write via createAdminClient()
-- (service_role, BYPASSRLS). So we enable RLS with NO policies => deny-all to
-- anon/authenticated, and revoke the default PostgREST grants. Same shape as
-- schema-patch-enable-rls-exposed-tables.sql.
--
-- Idempotent: safe to re-run. Seed uses ON CONFLICT DO NOTHING so admin edits
-- are never clobbered by a second run.
--
-- Run with: node scripts/run-sql.js schema-patch-email-templates.sql

-- ── email_templates ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  id          BIGSERIAL    PRIMARY KEY,
  kind        TEXT         NOT NULL UNIQUE,   -- 'purchase', '60d-unlock', etc.
  name        TEXT         NOT NULL,          -- human label (PT)
  description TEXT         NOT NULL DEFAULT '',
  subject     TEXT         NOT NULL,
  kicker      TEXT         NOT NULL DEFAULT '',  -- small line above headline, e.g. "Olá, {{displayName}}"
  headline    TEXT         NOT NULL DEFAULT '',
  body_html   TEXT         NOT NULL,
  cta_label   TEXT         NOT NULL DEFAULT '',  -- empty => no shell CTA button
  cta_href    TEXT         NOT NULL DEFAULT '',  -- '/path' is prefixed with app_url at render
  variables   JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{tag, description}] for the editor
  active      BOOLEAN      NOT NULL DEFAULT TRUE, -- false => renderer uses the code default
  sort_order  INT          NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_templates FROM anon, authenticated;

-- ── email_settings (singleton row, id = 1) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS email_settings (
  id            INT          PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  from_address  TEXT         NOT NULL,
  app_url       TEXT         NOT NULL,
  company_name  TEXT         NOT NULL,
  cnpj          TEXT         NOT NULL DEFAULT '',
  contact_email TEXT         NOT NULL DEFAULT '',
  address       TEXT         NOT NULL DEFAULT '',
  footer_note   TEXT         NOT NULL DEFAULT '',  -- free-form HTML line(s) for anything else
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by    UUID         REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON email_settings FROM anon, authenticated;

-- ── Seed: global settings ─────────────────────────────────────────────────────
-- Mirrors the current hardcoded values in lib/email.ts. cnpj/address intentionally
-- left blank so the admin fills in the missing footer info.

INSERT INTO email_settings (id, from_address, app_url, company_name, cnpj, contact_email, address, footer_note)
VALUES (
  1,
  'MedHelpSpace <pagamentos@medhelpspace.com.br>',
  'https://medhelpspace.com.br',
  'MedHelpSpace Revalida',
  '',
  'privacidade@medhelpspace.com.br',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: the six transactional templates ─────────────────────────────────────
-- Content lifted verbatim from lib/email.ts / the lifecycle cron. Kept in sync
-- with EMAIL_TEMPLATE_DEFAULTS in app/src/lib/email-render.ts (the code fallback).

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  (
    'purchase',
    'Confirmação de compra',
    'Enviado quando um pagamento é confirmado e o acesso é liberado.',
    'Acesso liberado — MedHelpSpace Revalida {{cohortName}}',
    '',
    'Bem-vindo, {{displayName}}!',
    $body$<p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
  Sua matrícula na turma <strong style="color:#111827;">{{cohortName}}</strong> foi confirmada.
  Você já tem acesso completo ao sistema.
</p>
<table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
  <tr>
    <td style="background:#7a1d91;border-radius:10px;">
      <a href="{{appUrl}}/app" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-.2px;">
        Entrar no sistema →
      </a>
    </td>
  </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:20px;margin-bottom:28px;">
  <tr>
    <td>
      <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7a1d91;">O que está incluso</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Questões comentadas e simulados</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Resumos narrativos por especialidade</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;MedVoice — treinamento em áudio</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Audiocards e Flashcards</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Fórmula MedHelp</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;MedHelp 60D — liberado 60 dias antes da prova</p>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
  Dúvidas? Responda este e-mail ou entre em contato pelo WhatsApp.<br/>
  Garantia incondicional de 7 dias — sem burocracia.
</p>$body$,
    '',
    '',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"cohortName","description":"Nome da turma comprada"}]'::jsonb,
    1
  ),
  (
    '60d-unlock',
    'Liberação do MedHelp 60D',
    'Enviado no dia em que o módulo MedHelp 60D é liberado para a turma.',
    'MedHelp 60D liberado — sua reta final começa agora',
    'Olá, {{displayName}}',
    'MedHelp 60D está liberado',
    'Faltam 60 dias para sua prova ({{testDate}}). O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Revalida Up, Memorecards e todos os recursos de reta final.',
    'Acessar MedHelp 60D →',
    '/app',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"testDate","description":"Data da prova por extenso (ex.: 15 de novembro de 2026)"}]'::jsonb,
    2
  ),
  (
    'expiry-warning-7d',
    'Aviso de expiração (7 dias)',
    'Enviado 7 dias antes do fim do acesso da turma.',
    'Seu acesso encerra em 7 dias',
    'Olá, {{displayName}}',
    'Seu acesso encerra em 7 dias',
    'Seu acesso à turma <strong>{{cohortName}}</strong> termina em {{endsAt}}. Aproveite os últimos dias para revisar o que ficou pendente. Se quiser continuar estudando, você pode renovar agora.',
    'Renovar acesso →',
    '/app/acesso-encerrado',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"cohortName","description":"Nome da turma"},{"tag":"endsAt","description":"Data de término do acesso por extenso"}]'::jsonb,
    3
  ),
  (
    'expiry-notice',
    'Aviso de acesso encerrado',
    'Enviado no dia em que o acesso da turma termina.',
    'Seu acesso ao MedHelpSpace foi encerrado',
    'Olá, {{displayName}}',
    'Acesso encerrado',
    'Seu acesso à turma <strong>{{cohortName}}</strong> foi encerrado. Esperamos que você tenha tido uma ótima preparação. Para continuar estudando na próxima turma, é só renovar.',
    'Ver próximas turmas →',
    '/app/acesso-encerrado',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"cohortName","description":"Nome da turma"}]'::jsonb,
    4
  ),
  (
    'weekly-summary',
    'Resumo semanal',
    'Enviado às segundas-feiras com as estatísticas de estudo da semana.',
    'Resumo semanal do seu plano de estudos',
    'Olá, {{displayName}}',
    'Seu resumo da semana',
    '{{summaryBody}}',
    'Ver plano e ajustar →',
    '/app/plano',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"summaryBody","description":"Frase de estatísticas gerada automaticamente (questões, acerto, aulas, dias ativos)"}]'::jsonb,
    5
  ),
  (
    'daily-plan',
    'Plano de estudos do dia',
    'Enviado diariamente aos membros que optaram pelo e-mail do plano do dia.',
    'Seu plano de estudos para hoje',
    'Olá, {{displayName}}',
    'Plano de hoje',
    'Seu plano personalizado está pronto na plataforma. Abra para ver as tarefas específicas baseadas no seu desempenho atual.{{daysToExamLine}}',
    'Abrir plano de hoje →',
    '/app/plano',
    '[{"tag":"displayName","description":"Primeiro nome do membro"},{"tag":"daysToExamLine","description":"Frase opcional com a contagem regressiva da prova (pode vir vazia)"}]'::jsonb,
    6
  )
ON CONFLICT (kind) DO NOTHING;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS email_templates;
-- DROP TABLE IF EXISTS email_settings;
-- (The renderer falls back to EMAIL_TEMPLATE_DEFAULTS / DEFAULT_EMAIL_SETTINGS in
--  app/src/lib/email-render.ts when the tables are absent, so sends keep working.)
