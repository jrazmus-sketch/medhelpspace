-- Admin notifications — alert admins about business events (new purchase,
-- payment problem, refund) by email, with a per-admin per-event delivery choice
-- (instant / daily digest / off).
--
-- Two tables:
--   admin_alerts             — append-only log of every alert-worthy event. The
--                              single source of truth for BOTH the instant sends
--                              (fired inline at the event) and the daily digest
--                              cron. UNIQUE(event_type, context_id) makes the
--                              alert fire exactly once even when the Pix webhook
--                              and the status poll both finalize the same order.
--   admin_notification_prefs — per-admin, per-event-type frequency. A missing row
--                              means "use the code default" (see ADMIN_NOTIFY_DEFAULTS
--                              in app/src/lib/admin-notify-types.ts), so we never
--                              need to seed specific admins by id.
--
-- Access model: neither table is member-facing. The trigger/send paths
-- (finalize.ts, the refund route, the digest cron) and the settings server action
-- all read/write via createAdminClient() (service_role, BYPASSRLS). So we enable
-- RLS with NO policies => deny-all to anon/authenticated, and revoke the default
-- PostgREST grants. Same shape as schema-patch-email-templates.sql.
--
-- Idempotent: safe to re-run.
--
-- Run with: node scripts/run-sql.js schema-patch-admin-notifications.sql

-- ── admin_alerts ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_alerts (
  id          BIGSERIAL    PRIMARY KEY,
  event_type  TEXT         NOT NULL,   -- 'new_purchase' | 'payment_problem' | 'refund'
  title       TEXT         NOT NULL,   -- short human summary line (PT)
  body        TEXT         NOT NULL DEFAULT '',
  metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- order_id, amount_cents, buyer, cohort, …
  context_id  TEXT,                    -- dedup key (e.g. order id); NULL = no dedup
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- One alert per (event_type, context_id). Postgres treats NULL context_id as
  -- distinct, so events with no key are never blocked — but our three event
  -- types all pass an order id.
  UNIQUE (event_type, context_id)
);

CREATE INDEX IF NOT EXISTS admin_alerts_created_idx ON admin_alerts (created_at);

ALTER TABLE admin_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_alerts FROM anon, authenticated;

-- ── admin_notification_prefs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_notification_prefs (
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT         NOT NULL,   -- 'new_purchase' | 'payment_problem' | 'refund'
  frequency  TEXT         NOT NULL DEFAULT 'off'
               CHECK (frequency IN ('instant', 'daily', 'off')),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_type)
);

ALTER TABLE admin_notification_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_notification_prefs FROM anon, authenticated;

-- ── Seed: admin alert email templates ─────────────────────────────────────────
-- email_templates already exists (schema-patch-email-templates.sql). These four
-- admin-facing kinds are kept in sync with EMAIL_TEMPLATE_DEFAULTS in
-- app/src/lib/email-render.ts. ON CONFLICT DO NOTHING => admin edits survive a re-run.

INSERT INTO email_templates (kind, name, description, subject, kicker, headline, body_html, cta_label, cta_href, variables, sort_order)
VALUES
  (
    'admin-new-purchase',
    '[Admin] Nova compra',
    'Enviado aos administradores quando um pagamento é confirmado.',
    '💳 Nova compra — {{cohortName}} ({{amount}})',
    'Nova compra confirmada',
    '{{buyerName}} entrou na turma {{cohortName}}',
    $body$<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um novo pagamento foi confirmado e o acesso já foi liberado automaticamente.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Comprador:</strong> {{buyerName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{buyerEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Turma:</strong> {{cohortName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Valor:</strong> {{amount}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Método:</strong> {{paymentMethod}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Pedido {{orderId}}</td></tr>
</table>$body$,
    'Ver no painel →',
    '/admin/members',
    '[{"tag":"buyerName","description":"Nome do comprador"},{"tag":"buyerEmail","description":"E-mail do comprador"},{"tag":"cohortName","description":"Turma comprada"},{"tag":"amount","description":"Valor pago formatado (ex.: R$ 497,00)"},{"tag":"paymentMethod","description":"Método de pagamento (Pix / Cartão)"},{"tag":"orderId","description":"ID do pedido"}]'::jsonb,
    7
  ),
  (
    'admin-payment-problem',
    '[Admin] Problema de pagamento',
    'Enviado aos administradores quando um pagamento liquida com valor divergente e é retido para revisão manual.',
    '⚠️ Pagamento retido para revisão — {{cohortName}}',
    'Pagamento retido para revisão',
    'Valor divergente em um pagamento',
    $body$<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um pagamento foi liquidado com um <strong>valor diferente</strong> do pedido. O acesso <strong>não</strong> foi liberado — o pedido está retido para revisão manual.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{buyerEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Turma:</strong> {{cohortName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Valor esperado:</strong> {{expectedAmount}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#b91c1c;">Valor pago:</strong> {{paidAmount}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Pedido {{orderId}}</td></tr>
</table>$body$,
    'Revisar no painel →',
    '/admin/billing',
    '[{"tag":"buyerEmail","description":"E-mail do comprador"},{"tag":"cohortName","description":"Turma do pedido"},{"tag":"expectedAmount","description":"Valor esperado do pedido (formatado)"},{"tag":"paidAmount","description":"Valor efetivamente liquidado (formatado)"},{"tag":"orderId","description":"ID do pedido"}]'::jsonb,
    8
  ),
  (
    'admin-refund',
    '[Admin] Estorno realizado',
    'Enviado aos administradores quando um estorno é processado.',
    '↩️ Estorno realizado — {{cohortName}} ({{amount}})',
    'Estorno processado',
    'Estorno de {{amount}} — {{cohortName}}',
    $body$<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um estorno foi processado e o acesso foi revogado.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Comprador:</strong> {{buyerName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{buyerEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Turma:</strong> {{cohortName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Valor:</strong> {{amount}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Processado por:</strong> {{actorName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Motivo:</strong> {{reason}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Pedido {{orderId}}</td></tr>
</table>$body$,
    'Ver no painel →',
    '/admin/billing',
    '[{"tag":"buyerName","description":"Nome do comprador"},{"tag":"buyerEmail","description":"E-mail do comprador"},{"tag":"cohortName","description":"Turma estornada"},{"tag":"amount","description":"Valor estornado formatado"},{"tag":"actorName","description":"Admin que processou o estorno"},{"tag":"reason","description":"Motivo informado (pode vir vazio)"},{"tag":"orderId","description":"ID do pedido"}]'::jsonb,
    9
  ),
  (
    'admin-digest',
    '[Admin] Resumo diário',
    'Resumo diário das atividades (compras, problemas, estornos) para admins que escolheram receber por dia.',
    'Resumo diário — {{digestDate}}',
    'Resumo de notificações',
    'Atividade das últimas 24h',
    '{{digestBody}}',
    'Abrir painel →',
    '/admin',
    '[{"tag":"digestDate","description":"Data do resumo por extenso"},{"tag":"digestBody","description":"Resumo em HTML gerado automaticamente pelo cron"}]'::jsonb,
    10
  )
ON CONFLICT (kind) DO NOTHING;

-- ── Rollback ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS admin_notification_prefs;
-- DROP TABLE IF EXISTS admin_alerts;
-- DELETE FROM email_templates WHERE kind IN
--   ('admin-new-purchase','admin-payment-problem','admin-refund','admin-digest');
-- (No app code hard-depends on these tables existing: lib/admin-notify.ts wraps
--  every read/write in try/catch and degrades to "no admin alert sent", so a
--  rollback never breaks a purchase, refund, or cron run.)
