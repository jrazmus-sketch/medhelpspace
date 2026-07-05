// Pure email rendering — NO DB, NO server-only, NO Resend imports.
//
// This is the shared seam between three callers:
//   • lib/email.ts            (server: fetch template+settings from DB, render, send)
//   • api/cron/lifecycle-…    (server: same, for the daily cron)
//   • admin email editor       (client: live preview as the admin types)
//
// Because it's pure it imports cleanly into a "use client" component, so the
// editor previews the *exact* HTML that will be sent. Templates and global
// settings live in the DB (email_templates / email_settings); the constants
// below are the seed source AND the fallback used when the tables are absent.

export type EmailVariable = { tag: string; description: string };

export type EmailTemplateRow = {
  kind: string;
  name: string;
  description: string;
  subject: string;
  kicker: string;
  headline: string;
  body_html: string;
  cta_label: string;
  cta_href: string;
  variables: EmailVariable[];
  active: boolean;
  sort_order: number;
};

export type EmailSettingsRow = {
  from_address: string;
  app_url: string;
  company_name: string;
  cnpj: string;
  contact_email: string;
  address: string;
  footer_note: string;
};

// ── Variable interpolation ─────────────────────────────────────────────────────

// Replace every {{ tag }} occurrence. Unknown tags collapse to "" so a stray
// placeholder never reaches a customer. Mirrors the (unescaped) interpolation the
// old template literals did — values come from our own DB rows.
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] ?? "" : "",
  );
}

// Tags referenced in a template body/subject/etc. — used by save-time validation
// to reject typos like {{cohort}} that would silently render empty.
export function extractTags(template: EmailTemplateRow): string[] {
  const fields = [
    template.subject,
    template.kicker,
    template.headline,
    template.body_html,
    template.cta_label,
    template.cta_href,
  ];
  const found = new Set<string>();
  for (const f of fields) {
    for (const m of f.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) found.add(m[1]);
  }
  return [...found];
}

// Settings-derived tags every template may use without declaring them.
const IMPLICIT_TAGS = new Set(["appUrl", "companyName", "contactEmail"]);

export function isKnownTag(tag: string, template: EmailTemplateRow): boolean {
  return IMPLICIT_TAGS.has(tag) || template.variables.some((v) => v.tag === tag);
}

// ── Sender identity ─────────────────────────────────────────────────────────────

// Warm-but-anonymous sender for EVERY funnel email (code, delivery, drip). A sender
// NAME is not the same as publicly naming a person, so this stays within the
// landing-page team-anonymity decision. FREE-FUNNEL-V2-SCOPE.md "Resolved decisions".
export const FUNNEL_SENDER_NAME = "Equipe MedHelpSpace";

// Swap the display name on a "Name <addr>" From header while KEEPING the verified
// sending address. Lets funnel emails go out as `Equipe MedHelpSpace <addr>`
// without touching the shared global from_address that other transactional emails
// use. Pure string logic — no DB, safe to import anywhere.
export function withSenderName(fromAddress: string, name: string): string {
  const m = fromAddress.match(/<([^>]+)>/);
  const addr = (m ? m[1] : fromAddress).trim();
  return `${name} <${addr}>`;
}

// ── Rendering ──────────────────────────────────────────────────────────────────

function resolveHref(href: string, appUrl: string): string {
  if (!href) return appUrl;
  return href.startsWith("/") ? `${appUrl}${href}` : href;
}

// `unsubscribeUrl` is set ONLY for list/marketing mail (the lead funnel). When
// present the footer switches to list-mail mode: a permission reminder ("you
// asked for the Simulado Honesto") + a working one-click unsubscribe — the two
// things that keep a young sending domain out of the spam folder. Member/
// transactional mail (no unsubscribe URL) keeps the account-settings line.
function renderFooter(settings: EmailSettingsRow, unsubscribeUrl?: string): string {
  const site = settings.app_url.replace(/^https?:\/\//, "");
  const contact = settings.contact_email;
  const isListEmail = Boolean(unsubscribeUrl && /^https?:\/\//.test(unsubscribeUrl));

  // Line 2 segments — only render the ones that are filled in.
  const idParts: string[] = [];
  if (settings.cnpj.trim()) idParts.push(`CNPJ ${settings.cnpj.trim()}`);
  if (contact.trim()) {
    idParts.push(
      `Contato: <a href="mailto:${contact.trim()}" style="color:#9ca3af;text-decoration:underline;">${contact.trim()}</a>`,
    );
  }
  const idLine = idParts.length
    ? `<p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">${idParts.join(" &nbsp;·&nbsp; ")}</p>`
    : "";

  const addressLine = settings.address.trim()
    ? `<p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">${settings.address.trim()}</p>`
    : "";

  const noteLine = settings.footer_note.trim()
    ? `<p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">${settings.footer_note.trim()}</p>`
    : "";

  // List mail: why-you-got-this + one-click unsubscribe. Member mail: account link
  // (a lead has no /app account, so that link would be dead for them).
  const manageLine = isListEmail
    ? `<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
      Você recebeu este e-mail porque pediu o Simulado Honesto no MedHelpSpace.
      <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.
    </p>`
    : `<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
      Para gerenciar suas notificações por email, acesse suas
      <a href="${settings.app_url}/app/configuracoes" style="color:#9ca3af;text-decoration:underline;">configurações de conta</a>.
    </p>`;

  return `<tr>
  <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
    <p style="margin:0 0 8px;font-size:11.5px;color:#9ca3af;line-height:1.5;">
      ${settings.company_name} &nbsp;·&nbsp;
      <a href="${settings.app_url}" style="color:#7a1d91;text-decoration:none;">${site}</a>
    </p>
    ${idLine}
    ${addressLine}
    ${noteLine}
    ${manageLine}
  </td>
</tr>`;
}

// Render a template against settings + per-recipient vars. Returns the final
// subject and full HTML document, ready to hand to Resend.
export function renderEmail(
  template: EmailTemplateRow,
  settings: EmailSettingsRow,
  vars: Record<string, string>,
): { subject: string; html: string } {
  // Reserved settings-globals are applied LAST so a per-recipient var (or a sample
  // placeholder) can never shadow them — {{appUrl}} always resolves to the real
  // configured URL, never a stray "[appUrl]".
  const allVars: Record<string, string> = {
    ...vars,
    appUrl: settings.app_url,
    companyName: settings.company_name,
    contactEmail: settings.contact_email,
  };
  const fill = (s: string) => interpolate(s, allVars);

  const subject = fill(template.subject);
  const kicker = fill(template.kicker);
  const headline = fill(template.headline);
  const body = fill(template.body_html);
  const ctaLabel = fill(template.cta_label);
  const ctaHref = resolveHref(fill(template.cta_href), settings.app_url);

  const kickerHtml = kicker
    ? `<p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;font-weight:600;">${kicker}</p>`
    : "";

  const headlineHtml = headline
    ? `<p style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-.4px;line-height:1.2;">${headline}</p>`
    : "";

  const ctaHtml = ctaLabel
    ? `<table cellpadding="0" cellspacing="0" style="margin-top:4px;margin-bottom:8px;">
      <tr>
        <td style="background:#7a1d91;border-radius:10px;">
          <a href="${ctaHref}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-.2px;">${ctaLabel}</a>
        </td>
      </tr>
    </table>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline || subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#7a1d91;padding:24px 40px;">
              <img src="${settings.app_url}/brand/medhelpspace-wordmark-email.png"
                alt="${settings.company_name}" width="245" height="23"
                style="display:block;border:0;line-height:100%;outline:none;text-decoration:none;width:245px;height:23px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${kickerHtml}
              ${headlineHtml}
              <div style="font-size:15px;color:#4b5563;line-height:1.65;">
                ${body}
              </div>
              ${ctaHtml}
            </td>
          </tr>
          ${renderFooter(settings, allVars.unsubscribeUrl)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

// ── Defaults (seed source + fallback when the DB tables are absent) ─────────────

export const DEFAULT_EMAIL_SETTINGS: EmailSettingsRow = {
  from_address: "MedHelpSpace <contato@medhelpspace.com.br>",
  app_url: "https://medhelpspace.com.br",
  company_name: "MedHelpSpace Revalida",
  cnpj: "",
  contact_email: "contato@medhelpspace.com.br",
  address: "",
  footer_note: "",
};

const PURCHASE_BODY = `<p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
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
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Revalida Up — mini-resumos</p>
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;MedHelp 60D — liberado 60 dias antes da prova</p>
    </td>
  </tr>
</table>
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
  Dúvidas? Responda este e-mail ou entre em contato pelo WhatsApp.<br/>
  Garantia incondicional de 7 dias — sem burocracia.
</p>`;

// Keyed by kind. Kept in sync with the seed in schema-patch-email-templates.sql.
export const EMAIL_TEMPLATE_DEFAULTS: Record<string, EmailTemplateRow> = {
  purchase: {
    kind: "purchase",
    name: "Confirmação de compra",
    description: "Enviado quando um pagamento é confirmado e o acesso é liberado.",
    subject: "Acesso liberado — MedHelpSpace Revalida {{cohortName}}",
    kicker: "",
    headline: "Bem-vindo, {{displayName}}!",
    body_html: PURCHASE_BODY,
    cta_label: "",
    cta_href: "",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "cohortName", description: "Nome da turma comprada" },
    ],
    active: true,
    sort_order: 1,
  },
  "60d-unlock": {
    kind: "60d-unlock",
    name: "Liberação do MedHelp 60D",
    description: "Enviado no dia em que o módulo MedHelp 60D é liberado para a turma.",
    subject: "MedHelp 60D liberado — sua reta final começa agora",
    kicker: "Olá, {{displayName}}",
    headline: "MedHelp 60D está liberado",
    body_html:
      "Faltam 60 dias para sua prova{{testDate}}. O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Fórmula MedHelp, Memorecards e todos os recursos de reta final.",
    cta_label: "Acessar MedHelp 60D →",
    cta_href: "/app",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      {
        tag: "testDate",
        description:
          "Data da prova por extenso, já com o parêntese (ex.: \" (15 de novembro de 2026)\") — vazio quando a data da turma ainda não foi confirmada pela banca.",
      },
    ],
    active: true,
    sort_order: 2,
  },
  "expiry-warning-7d": {
    kind: "expiry-warning-7d",
    name: "Aviso de expiração (7 dias)",
    description: "Enviado 7 dias antes do fim do acesso da turma.",
    subject: "Seu acesso encerra em 7 dias",
    kicker: "Olá, {{displayName}}",
    headline: "Seu acesso encerra em 7 dias",
    body_html:
      "Seu acesso à turma <strong>{{cohortName}}</strong> termina em {{endsAt}}. Aproveite os últimos dias para revisar o que ficou pendente. Se quiser continuar estudando, você pode renovar agora.",
    cta_label: "Renovar acesso →",
    cta_href: "/app/acesso-encerrado",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "cohortName", description: "Nome da turma" },
      { tag: "endsAt", description: "Data de término do acesso por extenso" },
    ],
    active: true,
    sort_order: 3,
  },
  "expiry-notice": {
    kind: "expiry-notice",
    name: "Aviso de acesso encerrado",
    description: "Enviado no dia em que o acesso da turma termina.",
    subject: "Seu acesso ao MedHelpSpace foi encerrado",
    kicker: "Olá, {{displayName}}",
    headline: "Acesso encerrado",
    body_html:
      "Seu acesso à turma <strong>{{cohortName}}</strong> foi encerrado. Esperamos que você tenha tido uma ótima preparação. Para continuar estudando na próxima turma, é só renovar.",
    cta_label: "Ver próximas turmas →",
    cta_href: "/app/acesso-encerrado",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "cohortName", description: "Nome da turma" },
    ],
    active: true,
    sort_order: 4,
  },
  "weekly-summary": {
    kind: "weekly-summary",
    name: "Resumo semanal",
    description: "Enviado às segundas-feiras com as estatísticas de estudo da semana.",
    subject: "Resumo semanal do seu plano de estudos",
    kicker: "Olá, {{displayName}}",
    headline: "Seu resumo da semana",
    body_html: "{{summaryBody}}",
    cta_label: "Ver plano e ajustar →",
    cta_href: "/app/plano",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      {
        tag: "summaryBody",
        description:
          "Frase de estatísticas gerada automaticamente (questões, acerto, aulas, dias ativos)",
      },
    ],
    active: true,
    sort_order: 5,
  },
  "daily-plan": {
    kind: "daily-plan",
    name: "Plano de estudos do dia",
    description: "Enviado diariamente aos membros que optaram pelo e-mail do plano do dia.",
    subject: "Seu plano de estudos para hoje",
    kicker: "Olá, {{displayName}}",
    headline: "Plano de hoje",
    body_html:
      "Seu plano personalizado está pronto na plataforma. Abra para ver as tarefas específicas baseadas no seu desempenho atual.{{daysToExamLine}}",
    cta_label: "Abrir plano de hoje →",
    cta_href: "/app/plano",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      {
        tag: "daysToExamLine",
        description: "Frase opcional com a contagem regressiva da prova (pode vir vazia)",
      },
    ],
    active: true,
    sort_order: 6,
  },

  // ── Admin-facing operational alerts (recipients are admins, not members) ──────
  "admin-new-purchase": {
    kind: "admin-new-purchase",
    name: "[Admin] Nova compra",
    description: "Enviado aos administradores quando um pagamento é confirmado.",
    subject: "💳 Nova compra — {{cohortName}} ({{amount}})",
    kicker: "Nova compra confirmada",
    headline: "{{buyerName}} entrou na turma {{cohortName}}",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um novo pagamento foi confirmado e o acesso já foi liberado automaticamente.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Comprador:</strong> {{buyerName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{buyerEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Turma:</strong> {{cohortName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Valor:</strong> {{amount}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Método:</strong> {{paymentMethod}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Pedido {{orderId}}</td></tr>
</table>`,
    cta_label: "Ver no painel →",
    cta_href: "/admin/members",
    variables: [
      { tag: "buyerName", description: "Nome do comprador" },
      { tag: "buyerEmail", description: "E-mail do comprador" },
      { tag: "cohortName", description: "Turma comprada" },
      { tag: "amount", description: "Valor pago formatado (ex.: R$ 497,00)" },
      { tag: "paymentMethod", description: "Método de pagamento (Pix / Cartão)" },
      { tag: "orderId", description: "ID do pedido" },
    ],
    active: true,
    sort_order: 7,
  },
  "admin-payment-problem": {
    kind: "admin-payment-problem",
    name: "[Admin] Problema de pagamento",
    description:
      "Enviado aos administradores quando um pagamento liquida com valor divergente e é retido para revisão manual.",
    subject: "⚠️ Pagamento retido para revisão — {{cohortName}}",
    kicker: "Pagamento retido para revisão",
    headline: "Valor divergente em um pagamento",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um pagamento foi liquidado com um <strong>valor diferente</strong> do pedido. O acesso <strong>não</strong> foi liberado — o pedido está retido para revisão manual.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{buyerEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Turma:</strong> {{cohortName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Valor esperado:</strong> {{expectedAmount}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#b91c1c;">Valor pago:</strong> {{paidAmount}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Pedido {{orderId}}</td></tr>
</table>`,
    cta_label: "Revisar no painel →",
    cta_href: "/admin/billing",
    variables: [
      { tag: "buyerEmail", description: "E-mail do comprador" },
      { tag: "cohortName", description: "Turma do pedido" },
      { tag: "expectedAmount", description: "Valor esperado do pedido (formatado)" },
      { tag: "paidAmount", description: "Valor efetivamente liquidado (formatado)" },
      { tag: "orderId", description: "ID do pedido" },
    ],
    active: true,
    sort_order: 8,
  },
  "admin-refund": {
    kind: "admin-refund",
    name: "[Admin] Estorno realizado",
    description: "Enviado aos administradores quando um estorno é processado.",
    subject: "↩️ Estorno realizado — {{cohortName}} ({{amount}})",
    kicker: "Estorno processado",
    headline: "Estorno de {{amount}} — {{cohortName}}",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
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
</table>`,
    cta_label: "Ver no painel →",
    cta_href: "/admin/billing",
    variables: [
      { tag: "buyerName", description: "Nome do comprador" },
      { tag: "buyerEmail", description: "E-mail do comprador" },
      { tag: "cohortName", description: "Turma estornada" },
      { tag: "amount", description: "Valor estornado formatado" },
      { tag: "actorName", description: "Admin que processou o estorno" },
      { tag: "reason", description: "Motivo informado (pode vir vazio)" },
      { tag: "orderId", description: "ID do pedido" },
    ],
    active: true,
    sort_order: 9,
  },
  "admin-digest": {
    kind: "admin-digest",
    name: "[Admin] Resumo diário",
    description:
      "Resumo diário das atividades (compras, problemas, estornos) para admins que escolheram receber por dia.",
    subject: "Resumo diário — {{digestDate}}",
    kicker: "Resumo de notificações",
    headline: "Atividade das últimas 24h",
    body_html: "{{digestBody}}",
    cta_label: "Abrir painel →",
    cta_href: "/admin",
    variables: [
      { tag: "digestDate", description: "Data do resumo por extenso" },
      {
        tag: "digestBody",
        description: "Resumo em HTML gerado automaticamente pelo cron",
      },
    ],
    active: true,
    sort_order: 10,
  },

  // ── Support / contact tickets ─────────────────────────────────────────────────
  "support-ticket-confirmation": {
    kind: "support-ticket-confirmation",
    name: "Confirmação de chamado de suporte",
    description: "Enviado ao membro quando ele abre um chamado de suporte.",
    subject: "Recebemos seu contato — MedHelpSpace",
    kicker: "Olá, {{displayName}}",
    headline: "Recebemos sua mensagem",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Seu chamado sobre <strong style="color:#111827;">{{ticketSubject}}</strong> foi registrado.
  Nossa equipe vai responder direto na plataforma — avisamos você por e-mail e pelo
  sino da sua conta assim que a resposta chegar.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Assunto:</strong> {{ticketCategory}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Protocolo:</strong> #{{ticketId}}</td></tr>
</table>
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
  Acompanhe e responda pela plataforma a qualquer momento pelo link abaixo.
  Não responda este e-mail.
</p>`,
    cta_label: "Ver meu chamado →",
    cta_href: "/suporte/{{ticketId}}",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "ticketSubject", description: "Assunto informado pelo membro" },
      { tag: "ticketCategory", description: "Categoria do chamado por extenso" },
      { tag: "ticketId", description: "Número do protocolo (id do chamado)" },
    ],
    active: true,
    sort_order: 11,
  },
  "support-ticket-reply": {
    kind: "support-ticket-reply",
    name: "Resposta ao chamado de suporte",
    description: "Enviado ao membro quando um administrador responde ao chamado.",
    subject: "Você tem uma resposta — MedHelpSpace",
    kicker: "Olá, {{displayName}}",
    headline: "Você tem uma resposta do suporte",
    body_html: `<p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
  Nossa equipe respondeu seu chamado sobre
  <strong style="color:#111827;">{{ticketSubject}}</strong>.
  Abra a conversa na plataforma para ver a resposta e responder.
</p>
<p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
  Não responda este e-mail — continue a conversa direto na plataforma.
</p>`,
    cta_label: "Ver no site →",
    cta_href: "/suporte/{{ticketId}}",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "ticketSubject", description: "Assunto do chamado" },
      { tag: "ticketId", description: "Número do protocolo (id do chamado)" },
    ],
    active: true,
    sort_order: 12,
  },

  // ── Admin-facing: new support ticket alert ────────────────────────────────────
  "admin-support-ticket": {
    kind: "admin-support-ticket",
    name: "[Admin] Novo chamado de suporte",
    description: "Enviado aos administradores quando um membro abre um chamado de suporte.",
    subject: "🆘 Novo chamado — {{ticketCategory}} ({{memberName}})",
    kicker: "Novo chamado de suporte",
    headline: "{{memberName}}: {{ticketSubject}}",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Um membro abriu um chamado de suporte. Responda pelo painel — a resposta chega ao
  membro por e-mail e dentro da plataforma.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5ff;border-radius:8px;padding:16px;margin-bottom:16px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Membro:</strong> {{memberName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">E-mail:</strong> {{memberEmail}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Categoria:</strong> {{ticketCategory}}</td></tr>
  <tr><td style="font-size:12px;color:#9ca3af;padding:3px 0;">Protocolo #{{ticketId}}</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:14px;color:#374151;line-height:1.6;">{{ticketBody}}</td></tr>
</table>`,
    cta_label: "Abrir no painel →",
    cta_href: "/admin/suporte",
    variables: [
      { tag: "memberName", description: "Nome do membro" },
      { tag: "memberEmail", description: "E-mail do membro" },
      { tag: "ticketCategory", description: "Categoria do chamado por extenso" },
      { tag: "ticketSubject", description: "Assunto do chamado" },
      { tag: "ticketBody", description: "Mensagem do membro (texto, já com escape)" },
      { tag: "ticketId", description: "Número do protocolo (id do chamado)" },
    ],
    active: true,
    sort_order: 13,
  },

  // ── Admin-facing: scheduled task (cron) failure ───────────────────────────────
  // The only ADMIN_ALERT_EVENTS kind with a real instant email that isn't seeded
  // in a schema-patch SQL file — mirrors admin-support-ticket's precedent of
  // relying purely on this code-side default (sendTemplateEmail falls back to
  // EMAIL_TEMPLATE_DEFAULTS when no DB row exists).
  "admin-cron-failure": {
    kind: "admin-cron-failure",
    name: "[Admin] Falha em tarefa automática",
    description: "Enviado aos administradores quando uma rotina agendada (cron) falha ao rodar.",
    subject: "⚠️ Falha na rotina {{cronName}}",
    kicker: "Tarefa automática falhou",
    headline: "{{cronName}} não completou a execução",
    body_html: `<p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
  Uma rotina agendada encontrou um erro e não terminou de rodar. Verifique os logs do
  Vercel para o(s) processo(s) que dependem dela (ex.: reconciliação de Pix, e-mails
  de ciclo de vida, resumo diário).
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Rotina:</strong> {{cronName}}</td></tr>
  <tr><td style="font-size:13.5px;color:#374151;padding:3px 0;"><strong style="color:#111827;">Horário:</strong> {{runAt}}</td></tr>
  <tr><td style="font-size:13.5px;color:#b91c1c;padding:3px 0;"><strong style="color:#111827;">Erro:</strong> {{errorMessage}}</td></tr>
</table>`,
    cta_label: "Ver no painel →",
    cta_href: "/admin",
    variables: [
      { tag: "cronName", description: "Nome da rotina agendada (ex.: reconcile-pix)" },
      { tag: "runAt", description: "Data/hora da execução que falhou" },
      { tag: "errorMessage", description: "Mensagem de erro capturada" },
    ],
    active: true,
    sort_order: 20,
  },

  // ── Lead-magnet funnel (recipients are anonymous leads, not members) ──────────
  // FREE-FUNNEL-V2-SCOPE.md. Every body carries a working {{unsubscribeUrl}} (the
  // fixed footer's account link goes to /app, which leads can't use). Sender name
  // is overridden to "Equipe MedHelpSpace" at the call site (fromName).

  // Verify-to-claim code. The code is FIRST in the subject so it shows in the phone
  // notification without opening. Transactional (user-requested) → minimal body,
  // no marketing unsubscribe. FREE-FUNNEL-V2-SCOPE.md items 3 + 8.
  "lead-code": {
    kind: "lead-code",
    name: "[Lead] Código de confirmação",
    description: "Código de 6 dígitos para desbloquear o plano + demonstração de flashcards.",
    subject: "{{code}} é o seu código — MedHelpSpace",
    kicker: "",
    headline: "Seu código de confirmação",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Use este código para desbloquear seu resultado completo, o plano de estudos e a demonstração de flashcards:</p>
<p style="margin:0 0 20px;text-align:center;">
  <span style="display:inline-block;background:#f9f5ff;border:1px solid #e9d5ff;border-radius:10px;padding:14px 24px;font-size:30px;font-weight:700;letter-spacing:.35em;color:#7a1d91;">{{code}}</span>
</p>
<p style="margin:0 0 8px;">Ele vale por <strong>10 minutos</strong>. Se não foi você que pediu, é só ignorar este e-mail.</p>`,
    cta_label: "",
    cta_href: "",
    variables: [
      { tag: "code", description: "Código de 6 dígitos" },
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
    ],
    active: true,
    sort_order: 13,
  },
  // Delivery, fired on CONFIRM (verify). Present tense — nothing was locked, the
  // material IS here now. Personalized greeting; plan link points at the durable
  // /resultado page (never the bare quiz URL). FREE-FUNNEL-V2-SCOPE.md item 9.
  // ── Flashcards funnel (gift-first, /flashcards-revalida) ──────────────────────
  // D0 delivery: the magic access link to the 50-card deck, sent the moment the lead
  // picks their turma. The click on this link (acesso route) is the verification.
  "lead-fc-access": {
    kind: "lead-fc-access",
    name: "[Lead] Flashcards — link de acesso",
    description: "Funil de flashcards (gift-first): entrega o link mágico dos 50 flashcards ao escolher a turma.",
    subject: "Seus 50 flashcards do Revalida estão prontos 🎯",
    kicker: "",
    headline: "Seu acesso está pronto",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Aqui está o seu baralho com <strong>50 flashcards</strong> dos 6 assuntos que mais caem na 1ª etapa do Revalida — escolhidos pela incidência real nas provas de 2020 a 2025.</p>
<p style="margin:0 0 20px;">É só clicar no botão abaixo para começar a estudar agora, com revisão espaçada e correção na hora:</p>
<p style="margin:0 0 16px;">Cada card vem dos temas de maior incidência de <strong>Pediatria, Cirurgia, Ginecologia, Obstetrícia, Saúde Coletiva e Infectologia</strong>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Você recebeu este e-mail porque pediu os flashcards em medhelpspace.com.br. Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Abrir meus 50 flashcards →",
    cta_href: "{{accessUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "accessUrl", description: "Link mágico de acesso aos flashcards (token)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 13,
  },
  // D2 of the flashcards funnel: the welcome coupon (5% 2026.2 / 10% 2027.1 & 2027.2).
  "lead-fc-d2": {
    kind: "lead-fc-d2",
    name: "[Lead] Flashcards D2 — cupom de boas-vindas",
    description: "2 dias após pegar os flashcards: o cupom de desconto para a plataforma completa.",
    subject: "Seu cupom de {{couponPercent}} para estudar com tudo",
    kicker: "",
    headline: "Os 50 flashcards foram só uma amostra",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Que bom que você começou pelos assuntos que mais caem. Aqueles 50 flashcards são uma fração do que tem dentro da plataforma: milhares de cards, questões comentadas de provas anteriores, resumos, MedVoice e um plano que se ajusta até a data da sua prova.</p>
<p style="margin:0 0 16px;">Pra te ajudar a dar o próximo passo, separei um cupom de boas-vindas: <strong>{{coupon}}</strong> — {{couponPercent}} de desconto.</p>
<p style="margin:0 0 8px;">Quer revisar os flashcards de novo antes? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu baralho</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Usar meu cupom de {{couponPercent}} →",
    cta_href: "{{checkoutUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "coupon", description: "Código do cupom de boas-vindas da turma" },
      { tag: "couponPercent", description: "Percentual do cupom (ex.: '10%')" },
      { tag: "checkoutUrl", description: "Link de checkout com o cupom aplicado" },
      { tag: "accessUrl", description: "Link para reabrir o baralho de flashcards" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 13.1,
  },
  // D5 of the flashcards funnel: last-call nudge (same coupon, gentle urgency).
  "lead-fc-d5": {
    kind: "lead-fc-d5",
    name: "[Lead] Flashcards D5 — última chamada",
    description: "5 dias após pegar os flashcards: último lembrete do cupom de boas-vindas.",
    subject: "Ainda dá tempo — {{couponPercent}} na plataforma completa",
    kicker: "",
    headline: "Estudar sozinho é mais difícil do que precisa ser",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Flashcard solto ajuda — mas o que aprova é constância: revisar as matérias certas, na ordem certa, todo dia, com o sistema lembrando você do que está prestes a esquecer.</p>
<p style="margin:0 0 16px;">É exatamente isso que a plataforma faz por você. Seu cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) ainda está de pé.</p>
<p style="margin:0 0 8px;">Quer estudar os flashcards mais uma vez? <a href="{{accessUrl}}" style="color:#7a1d91;">Reabrir meu baralho</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Garantir minha vaga com {{couponPercent}} →",
    cta_href: "{{checkoutUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "coupon", description: "Código do cupom de boas-vindas da turma" },
      { tag: "couponPercent", description: "Percentual do cupom (ex.: '10%')" },
      { tag: "checkoutUrl", description: "Link de checkout com o cupom aplicado" },
      { tag: "accessUrl", description: "Link para reabrir o baralho de flashcards" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 13.2,
  },
  // Finish-reminder 1 — sent to a NON-finisher (didn't complete the deck) at +1 day.
  // Come back and finish; NO coupon (free value first). Magic link resumes progress.
  "lead-fc-finish-1": {
    kind: "lead-fc-finish-1",
    name: "[Lead] Flashcards — continue (lembrete 1)",
    description: "Enviado a quem não terminou o baralho (+1 dia): volte e continue de onde parou.",
    subject: "Seus flashcards do Revalida estão te esperando",
    kicker: "",
    headline: "Continue de onde você parou",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Você pegou seus 50 flashcards mas ainda não terminou o baralho — e ele está guardadinho, com o seu progresso salvo.</p>
<p style="margin:0 0 16px;">É só continuar de onde parou pelo <strong>mesmo link</strong>. Leva poucos minutos e cobre os assuntos que mais caem na 1ª etapa.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Continuar meus flashcards →",
    cta_href: "{{accessUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "accessUrl", description: "Link mágico para retomar o baralho (resume o progresso)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 13.3,
  },
  // Finish-reminder 2 — sent to a NON-finisher at +3 days: come back + the welcome
  // coupon (folded in, so a never-finisher still gets the discount exactly once).
  "lead-fc-finish-2": {
    kind: "lead-fc-finish-2",
    name: "[Lead] Flashcards — continue + cupom (lembrete 2)",
    description: "Enviado a quem não terminou o baralho (+3 dias): termine + cupom de boas-vindas.",
    subject: "Faltam poucos flashcards — e um cupom pra você",
    kicker: "",
    headline: "Termine seu baralho (e leve um desconto)",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Seus flashcards continuam te esperando — faltam <strong>{{cardsLeft}}</strong> para terminar. É rápido, e o seu progresso está salvo.</p>
<p style="margin:0 0 16px;">E um empurrãozinho pra ir além da amostra: o cupom <strong>{{coupon}}</strong> ({{couponPercent}} de desconto) na plataforma completa — milhares de cards, questões comentadas e revisão espaçada.</p>
<p style="margin:0 0 8px;">Ver a plataforma com desconto: <a href="{{checkoutUrl}}" style="color:#7a1d91;">aproveitar {{couponPercent}}</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Terminar meus flashcards →",
    cta_href: "{{accessUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "cardsLeft", description: "Quantos flashcards faltam para terminar" },
      { tag: "coupon", description: "Código do cupom de boas-vindas (ou FLASH5 p/ indecisos)" },
      { tag: "couponPercent", description: "Percentual do cupom (ex.: '5%')" },
      { tag: "accessUrl", description: "Link mágico para retomar o baralho" },
      { tag: "checkoutUrl", description: "Link de checkout/loja com o cupom" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 13.4,
  },
  "lead-d0": {
    kind: "lead-d0",
    name: "[Lead] Entrega — plano + flashcards",
    description: "Enviado ao confirmar o código: entrega o plano + flashcards, present tense, sem pitch.",
    subject: "Seu plano de estudos e seus flashcards estão prontos",
    kicker: "",
    headline: "Tudo pronto pra você começar",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Seu resultado, seu plano de estudos personalizado e sua demonstração de flashcards com revisão espaçada estão aqui:</p>
<p style="margin:0 0 8px;">🔹 Seu plano + resultado completo — <a href="{{resultUrl}}" style="color:#7a1d91;">abrir meu plano</a></p>
<p style="margin:0 0 20px;">🔹 Os flashcards das suas matérias mais fracas, já prontos pra praticar</p>
<p style="margin:0 0 16px;">São <strong>questões reais de provas anteriores</strong> do Revalida, comentadas uma a uma.</p>
<p style="margin:0 0 8px;">Nos próximos dias eu te mando alguns lembretes e o caminho até a prova — mas o material já está todo aqui, sem esperar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Ver meu plano de estudos →",
    cta_href: "{{resultUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "resultUrl", description: "Link durável do resultado/plano (token)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 14,
  },
  "lead-d1": {
    kind: "lead-d1",
    name: "[Lead] D1 — Diagnóstico honesto",
    description: "Enviado 1 dia após a captura: o resultado e o que fazer com ele.",
    subject: "Você acertou {{score}}/15. O que isso diz sobre {{examLabel}}.",
    kicker: "",
    headline: "Seu resultado e o que fazer com ele",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Você acertou <strong>{{score}}/15</strong>. A 1ª etapa aprova cerca de 1 em cada 4 — então cada ponto conta.</p>
<p style="margin:0 0 16px;">Pelo seu resultado, seus pontos mais fracos agora são <strong>{{weakSpecialties}}</strong>. A boa notícia: dá pra virar esse jogo, se você revisar as matérias certas, na ordem certa.</p>
<p style="margin:0 0 8px;">Montamos um plano que prioriza exatamente os seus pontos fracos até {{examLabel}} — ele continua aqui.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Ver meu plano até a prova →",
    cta_href: "{{resultUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "score", description: "Acertos do lead (0–15)" },
      { tag: "weakSpecialties", description: "Especialidades mais fracas (nomes)" },
      { tag: "examLabel", description: "Data da prova do cohort (ex.: 13 de setembro)" },
      { tag: "resultUrl", description: "Link durável do resultado/plano (token)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 15,
  },
  "lead-d2": {
    kind: "lead-d2",
    name: "[Lead] D2 — A conta de reprovar",
    description: "Enviado 2 dias após a captura: o custo real de reprovar.",
    subject: "A conta que ninguém te mostra",
    kicker: "",
    headline: "Quanto custa reprovar",
    body_html: `<p style="margin:0 0 12px;">{{greeting}}Ninguém gosta de fazer essa conta, mas ela importa:</p>
<p style="margin:0 0 6px;">• Taxa da prova: <strong>R$410</strong></p>
<p style="margin:0 0 6px;">• A prova custa <strong>R$4.516</strong> em taxas</p>
<p style="margin:0 0 16px;">• Reprovar e refazer a 2ª fase: <strong>+~R$4.106</strong> — e mais um ano sem poder exercer</p>
<p style="margin:0 0 8px;">O método completo da 1ª etapa custa <strong>R$3.990</strong> — menos do que custa reprovar uma vez.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Conhecer o método completo →",
    cta_href: "{{checkoutUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "checkoutUrl", description: "Link de checkout com cupom + e-mail" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 16,
  },
  "lead-d4": {
    kind: "lead-d4",
    name: "[Lead] D4 — Seu plano está esperando",
    description: "Enviado 4 dias após a captura: a transformação/o plano.",
    subject: "Seu plano de estudos está esperando",
    kicker: "",
    headline: "Seu plano continua aqui",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Seu plano personalizado até {{examLabel}} continua disponível, com <strong>{{weakSpecialties}}</strong> no topo da fila.</p>
<p style="margin:0 0 16px;">Não é mais conteúdo — é a ordem certa: questões comentadas, flashcards com revisão espaçada e áudio-aulas, distribuídos dia a dia até a prova. Você sempre sabe o que estudar hoje.</p>
<p style="margin:0 0 8px;">Quanto antes você entra, mais tempo de estudo. Esperar custa caro — em dias de revisão.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Ver meu plano de estudos →",
    cta_href: "{{resultUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "weakSpecialties", description: "Especialidades mais fracas (nomes)" },
      { tag: "examLabel", description: "Data da prova do cohort (ex.: 13 de setembro)" },
      { tag: "resultUrl", description: "Link durável do resultado/plano (token)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 17,
  },
  "lead-d7": {
    kind: "lead-d7",
    name: "[Lead] D7 — A oferta honesta",
    description: "Enviado 7 dias após a captura: anti-claim + garantia.",
    subject: "Não prometo aprovação. Prometo isto:",
    kicker: "",
    headline: "A oferta mais honesta da categoria",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Vou ser direto: <strong>não prometo sua aprovação.</strong> Nenhum curso honesto pode.</p>
<p style="margin:0 0 16px;">O que eu prometo é que você vai resolver mais questões reais comentadas, com revisão espaçada, do que em qualquer cursão de R$10 mil — e se em 7 dias você achar que não é pra você, <strong>devolvo cada centavo, sem perguntas.</strong></p>
<p style="margin:0 0 8px;">Feito pra quem se formou fora. Você já é médico — falta o reconhecimento.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Garantir minha vaga (7 dias de garantia) →",
    cta_href: "{{checkoutUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "checkoutUrl", description: "Link de checkout com cupom + e-mail" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 18,
  },
  "lead-final": {
    kind: "lead-final",
    name: "[Lead] Final — Última chamada",
    description:
      "APOSENTADO (2026-07-02): o funil não envia mais este e-mail. O ciclo de desconto grande (ULTIMA2026) foi removido; a promo agora é só o cupom de boas-vindas no D2.",
    subject: "Faltam poucas semanas para a 1ª etapa",
    kicker: "",
    headline: "Última chamada para a turma 2026.2",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Faltam poucas semanas para a 1ª etapa (13/09) e a turma 2026.2 já está na reta de estudo.</p>
<p style="margin:0 0 16px;">Como o tempo de estudo até a prova é curto, liberamos a sua condição de reta final — o melhor preço que a gente oferece, só pra quem está nesta lista. É justo dos dois lados: menos tempo, preço menor.</p>
<p style="margin:0 0 8px;">Seu plano está pronto. É só começar.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Começar agora →",
    cta_href: "{{checkoutUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "checkoutUrl", description: "Link de checkout com cupom último + e-mail" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 19,
  },

  // ── Pre-verify recovery (lead-recovery cron) ──────────────────────────────────
  // These target UNVERIFIED leads (never emailed by the verified drip). Segment A
  // finished the test; Segment B abandoned it. FREE-FUNNEL — recovery add-on.

  // Segment A — finished all 15, never typed the 6-digit code. ONE click (magic
  // link) verifies them and reveals the plan. No code to type — that was the friction.
  "lead-recover-finished": {
    kind: "lead-recover-finished",
    name: "[Lead] Recuperação — terminou, faltou confirmar",
    description:
      "Segmento A: respondeu as 15 mas não confirmou o e-mail. Link mágico que confirma em 1 clique e abre o plano — sem código.",
    subject: "Faltou 1 clique: seu plano e seus flashcards já estão prontos",
    kicker: "",
    headline: "Seu material está pronto — falta só 1 clique",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Você terminou o simulado (acertou <strong>{{score}}/15</strong>) mas parou antes de desbloquear o material. Ele já está montado esperando por você.</p>
<p style="margin:0 0 8px;">🔹 Seu resultado completo e o plano de estudos priorizando <strong>{{weakSpecialties}}</strong></p>
<p style="margin:0 0 16px;">🔹 A demonstração de flashcards com revisão espaçada das suas matérias mais fracas</p>
<p style="margin:0 0 8px;">Sem código para digitar desta vez — é só clicar no botão abaixo e abrir tudo.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Abrir meu plano (1 clique) →",
    cta_href: "{{recoverUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "score", description: "Acertos do lead (0–15)" },
      { tag: "weakSpecialties", description: "Especialidades mais fracas (nomes)" },
      { tag: "recoverUrl", description: "Link mágico de confirmação em 1 clique (token)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 20,
  },

  // Segment B, nudge 1 (+1 day) — abandoned mid-quiz. Bring them back to FINISH.
  "lead-recover-unfinished-1": {
    kind: "lead-recover-unfinished-1",
    name: "[Lead] Recuperação — não terminou (1)",
    description:
      "Segmento B, 1º lembrete (+1 dia): começou o simulado grátis e não terminou. Link retoma de onde parou. Cupom de recuperação como incentivo.",
    subject: "Você parou no meio do simulado — dá pra terminar em minutos",
    kicker: "",
    headline: "Seu simulado ficou pela metade",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Você começou o simulado grátis da 1ª etapa mas não chegou ao fim — e é lá, no final, que liberamos <strong>seu resultado comentado, o plano de estudos e a demonstração de flashcards</strong>.</p>
<p style="margin:0 0 16px;">Suas respostas estão salvas: o link abaixo retoma exatamente de onde você parou. São só alguns minutos para terminar.</p>
<p style="margin:0 0 8px;">E quando você decidir entrar no método completo, use o cupom <strong>{{coupon}}</strong> para <strong>{{couponPercent}} de desconto</strong>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Terminar meu simulado →",
    cta_href: "{{resumeUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "resumeUrl", description: "Link que retoma o simulado de onde parou (token)" },
      { tag: "coupon", description: "Cupom de recuperação (ex.: VOLTA10)" },
      { tag: "couponPercent", description: "Percentual do cupom (ex.: 10%)" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 21,
  },

  // Segment B, nudge 2 (+3 days, only if still unfinished) — last touch. Adds a
  // direct checkout path alongside the resume link.
  "lead-recover-unfinished-2": {
    kind: "lead-recover-unfinished-2",
    name: "[Lead] Recuperação — não terminou (2)",
    description:
      "Segmento B, 2º e último lembrete (+3 dias): ainda não terminou. Reforça o incentivo + caminho direto para o checkout com o cupom.",
    subject: "Último lembrete: seu resultado e {{couponPercent}} de desconto esperam",
    kicker: "",
    headline: "Seu progresso ainda está salvo",
    body_html: `<p style="margin:0 0 16px;">{{greeting}}Este é o último lembrete — depois dele eu paro de te escrever sobre isso. Seu simulado ainda está salvo, exatamente onde você parou.</p>
<p style="margin:0 0 16px;">Termine para ver <strong>onde você está</strong> na 1ª etapa e receber o plano até a data da sua prova. É rápido e é de graça.</p>
<p style="margin:0 0 8px;">Se preferir já garantir o método completo, o cupom <strong>{{coupon}}</strong> dá <strong>{{couponPercent}} de desconto</strong>: <a href="{{checkoutUrl}}" style="color:#7a1d91;">ver as turmas</a>.</p>
<p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Não quer mais receber? <a href="{{unsubscribeUrl}}" style="color:#9ca3af;text-decoration:underline;">Cancelar e-mails</a>.</p>`,
    cta_label: "Terminar meu simulado →",
    cta_href: "{{resumeUrl}}",
    variables: [
      { tag: "greeting", description: "Saudação pré-montada (ex.: 'Oi, Maria! ' ou vazio)" },
      { tag: "resumeUrl", description: "Link que retoma o simulado de onde parou (token)" },
      { tag: "coupon", description: "Cupom de recuperação (ex.: VOLTA10)" },
      { tag: "couponPercent", description: "Percentual do cupom (ex.: 10%)" },
      { tag: "checkoutUrl", description: "Link de checkout com cupom + e-mail" },
      { tag: "unsubscribeUrl", description: "Link de cancelamento (one-click)" },
    ],
    active: true,
    sort_order: 22,
  },
};

// Sample values for the editor preview and the admin "test send" — one entry per
// known variable so previews look realistic. Shared so preview === test send.
export const SAMPLE_VARS: Record<string, string> = {
  displayName: "Maria",
  cohortName: "Revalida 2026.2",
  testDate: " (15 de novembro de 2026)",
  endsAt: "30 de novembro de 2026",
  summaryBody:
    "Esta semana: <strong>42 questões</strong> respondidas com <strong>78% de acerto</strong>, <strong>5 aulas</strong> concluídas, em <strong>4 dias</strong> ativos. Faltam 120 dias para a prova.",
  daysToExamLine: " <br/><br/>Faltam <strong>120 dias</strong> para sua prova.",
  // Admin-alert samples
  buyerName: "João Silva",
  buyerEmail: "joao.silva@example.com",
  amount: "R$ 497,00",
  paymentMethod: "Pix",
  orderId: "a1b2c3d4-0000-0000-0000-000000000000",
  expectedAmount: "R$ 497,00",
  paidAmount: "R$ 297,00",
  actorName: "Justin",
  reason: "Solicitado pelo aluno",
  digestDate: "25 de junho de 2026",
  digestBody:
    '<p style="margin:0 0 16px;font-size:15px;color:#4b5563;line-height:1.6;">Nas últimas 24h:</p><p style="margin:0 0 8px;font-size:14px;color:#374151;">💳 <strong>2 novas compras</strong> · R$ 994,00</p><p style="margin:0 0 8px;font-size:14px;color:#374151;">↩️ <strong>1 estorno</strong> · R$ 497,00</p>',
  // Support-ticket samples
  memberName: "Maria Souza",
  memberEmail: "maria.souza@example.com",
  ticketCategory: "Problema técnico",
  ticketSubject: "O áudio do MedVoice não toca no celular",
  ticketBody:
    "Quando abro uma aula do MedVoice pelo celular, o player aparece mas o áudio não começa. No computador funciona normal.",
  replyExcerpt:
    "Oi, Maria! Já corrigimos o player no celular — pode testar de novo e nos contar se resolveu?",
  ticketId: "1042",
  // Lead-magnet funnel samples
  score: "7",
  weakSpecialties: "Cardiologia, Nefrologia",
  examLabel: "13 de setembro",
  code: "483920",
  greeting: "Oi, Maria! ",
  magnetUrl: "https://medhelpspace.com.br/questoes-revalida",
  deckUrl: "https://medhelpspace.com.br/flashcards-gratis",
  resultUrl:
    "https://medhelpspace.com.br/questoes-revalida/resultado?lead=00000000-0000-0000-0000-000000000000",
  checkoutUrl:
    "https://medhelpspace.com.br/checkout?cohort=revalida-2026-2&cupom=REVALIDA5",
  unsubscribeUrl: "https://medhelpspace.com.br/api/leads/unsubscribe?t=sample",
  // Recovery-funnel samples
  recoverUrl:
    "https://medhelpspace.com.br/questoes-revalida/recuperar?t=00000000-0000-0000-0000-000000000000",
  resumeUrl:
    "https://medhelpspace.com.br/questoes-revalida?retomar=00000000-0000-0000-0000-000000000000",
  coupon: "VOLTA10",
  couponPercent: "10%",
};

export function sampleVarsFor(template: EmailTemplateRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of template.variables) out[v.tag] = SAMPLE_VARS[v.tag] ?? `[${v.tag}]`;
  return out;
}
