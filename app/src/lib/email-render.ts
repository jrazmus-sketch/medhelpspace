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

// ── Rendering ──────────────────────────────────────────────────────────────────

function resolveHref(href: string, appUrl: string): string {
  if (!href) return appUrl;
  return href.startsWith("/") ? `${appUrl}${href}` : href;
}

function renderFooter(settings: EmailSettingsRow): string {
  const site = settings.app_url.replace(/^https?:\/\//, "");
  const contact = settings.contact_email;

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

  return `<tr>
  <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
    <p style="margin:0 0 8px;font-size:11.5px;color:#9ca3af;line-height:1.5;">
      ${settings.company_name} &nbsp;·&nbsp;
      <a href="${settings.app_url}" style="color:#7a1d91;text-decoration:none;">${site}</a>
    </p>
    ${idLine}
    ${addressLine}
    ${noteLine}
    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
      Para gerenciar suas notificações por email, acesse suas
      <a href="${settings.app_url}/app/configuracoes" style="color:#9ca3af;text-decoration:underline;">configurações de conta</a>.
    </p>
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
            <td style="background:#7a1d91;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">
                ${settings.company_name}
              </p>
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
          ${renderFooter(settings)}
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
  from_address: "MedHelpSpace <pagamentos@medhelpspace.com.br>",
  app_url: "https://medhelpspace.com.br",
  company_name: "MedHelpSpace Revalida",
  cnpj: "",
  contact_email: "privacidade@medhelpspace.com.br",
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
      <p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;Fórmula MedHelp</p>
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
      "Faltam 60 dias para sua prova ({{testDate}}). O módulo intensivo <strong>MedHelp 60D</strong> agora está disponível — Revalida Up, Memorecards e todos os recursos de reta final.",
    cta_label: "Acessar MedHelp 60D →",
    cta_href: "/app",
    variables: [
      { tag: "displayName", description: "Primeiro nome do membro" },
      { tag: "testDate", description: "Data da prova por extenso (ex.: 15 de novembro de 2026)" },
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
};

// Sample values for the editor preview and the admin "test send" — one entry per
// known variable so previews look realistic. Shared so preview === test send.
export const SAMPLE_VARS: Record<string, string> = {
  displayName: "Maria",
  cohortName: "Revalida 2026.2",
  testDate: "15 de novembro de 2026",
  endsAt: "30 de novembro de 2026",
  summaryBody:
    "Esta semana: <strong>42 questões</strong> respondidas com <strong>78% de acerto</strong>, <strong>5 aulas</strong> concluídas, em <strong>4 dias</strong> ativos. Faltam 120 dias para a prova.",
  daysToExamLine: " <br/><br/>Faltam <strong>120 dias</strong> para sua prova.",
};

export function sampleVarsFor(template: EmailTemplateRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of template.variables) out[v.tag] = SAMPLE_VARS[v.tag] ?? `[${v.tag}]`;
  return out;
}
