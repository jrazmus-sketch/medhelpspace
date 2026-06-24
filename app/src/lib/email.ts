import { Resend } from "resend";

const FROM = "MedHelpSpace <pagamentos@medhelpspace.com.br>";
const APP_URL = "https://medhelpspace.com.br";

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendPurchaseConfirmation({
  to,
  name,
  cohortName,
}: {
  to: string;
  name: string;
  cohortName: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) return { ok: false, reason: "no_api_key" };
  const displayName = name || to.split("@")[0];

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Acesso liberado — MedHelpSpace Revalida ${cohortName}`,
      html: purchaseConfirmationHtml({ displayName, cohortName }),
    });
    // The Resend SDK reports API errors (e.g. an unverified sending domain) on the
    // returned `error` field rather than throwing — so a silently-rejected send
    // looks like success unless we inspect it. Callers that need to know (the admin
    // resend tool) rely on this; the fire-and-forget finalize path ignores it.
    if (error) return { ok: false, reason: error.message ?? "send_error" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send_throw" };
  }
}

// ── 60D unlock notification ───────────────────────────────────────────────────

export async function send60DUnlockEmail({
  to,
  name,
  testDate,
}: {
  to: string;
  name: string;
  testDate: string; // YYYY-MM-DD
}) {
  const resend = getResend();
  if (!resend) return;
  const displayName = name || to.split("@")[0];
  const formattedDate = new Date(testDate + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });

  await resend.emails.send({
    from: FROM,
    to,
    subject: "MedHelp 60D liberado — sua reta final começa agora",
    html: lifecycleEmailHtml({
      displayName,
      headline: "MedHelp 60D está liberado",
      body: `
        Faltam 60 dias para sua prova (${formattedDate}). O módulo intensivo
        <strong>MedHelp 60D</strong> agora está disponível — Revalida Up,
        Memorecards e todos os recursos de reta final.
      `,
      ctaLabel: "Acessar MedHelp 60D →",
      ctaHref: `${APP_URL}/app`,
    }),
  });
}

// ── Membership expiry warning (7 days before) ────────────────────────────────

export async function sendExpiryWarningEmail({
  to,
  name,
  cohortName,
  endsAt,
}: {
  to: string;
  name: string;
  cohortName: string;
  endsAt: string;
}) {
  const resend = getResend();
  if (!resend) return;
  const displayName = name || to.split("@")[0];
  const formattedDate = new Date(endsAt).toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  });

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Seu acesso encerra em 7 dias",
    html: lifecycleEmailHtml({
      displayName,
      headline: "Seu acesso encerra em 7 dias",
      body: `
        Seu acesso à turma <strong>${cohortName}</strong> termina em
        ${formattedDate}. Aproveite os últimos dias para revisar o que ficou
        pendente. Se quiser continuar estudando, você pode renovar agora.
      `,
      ctaLabel: "Renovar acesso →",
      ctaHref: `${APP_URL}/app/acesso-encerrado`,
    }),
  });
}

// ── Membership expiry notice (after expiration) ───────────────────────────────

export async function sendExpiryNoticeEmail({
  to,
  name,
  cohortName,
}: {
  to: string;
  name: string;
  cohortName: string;
}) {
  const resend = getResend();
  if (!resend) return;
  const displayName = name || to.split("@")[0];

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Seu acesso ao MedHelpSpace foi encerrado",
    html: lifecycleEmailHtml({
      displayName,
      headline: "Acesso encerrado",
      body: `
        Seu acesso à turma <strong>${cohortName}</strong> foi encerrado.
        Esperamos que você tenha tido uma ótima preparação.
        Para continuar estudando na próxima turma, é só renovar.
      `,
      ctaLabel: "Ver próximas turmas →",
      ctaHref: `${APP_URL}/app/acesso-encerrado`,
    }),
  });
}

// ── Shared lifecycle template ─────────────────────────────────────────────────

export function lifecycleEmailHtml({
  displayName, headline, body, ctaLabel, ctaHref,
}: {
  displayName: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#7a1d91;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">
                MedHelpSpace Revalida
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.1em;font-weight:600;">
                Olá, ${displayName}
              </p>
              <p style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-.4px;line-height:1.2;">
                ${headline}
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.65;">
                ${body.trim()}
              </p>
              <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                  <td style="background:#7a1d91;border-radius:10px;">
                    <a href="${ctaHref}"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-.2px;">
                      ${ctaLabel}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0 0 8px;font-size:11.5px;color:#9ca3af;line-height:1.5;">
                MedHelpSpace Revalida &nbsp;·&nbsp;
                <a href="${APP_URL}" style="color:#7a1d91;text-decoration:none;">medhelpspace.com.br</a>
              </p>
              <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">
                CNPJ CNPJ_TO_FILL_IN &nbsp;·&nbsp; Contato:
                <a href="mailto:privacidade@medhelpspace.com.br" style="color:#9ca3af;text-decoration:underline;">privacidade@medhelpspace.com.br</a>
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
                Para gerenciar suas notificações por email, acesse suas
                <a href="${APP_URL}/app/configuracoes" style="color:#9ca3af;text-decoration:underline;">configurações de conta</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function purchaseConfirmationHtml({
  displayName,
  cohortName,
}: {
  displayName: string;
  cohortName: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acesso liberado</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

          <!-- Header bar -->
          <tr>
            <td style="background:#7a1d91;padding:28px 40px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.3px;">
                MedHelpSpace Revalida
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 12px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-.4px;">
                Bem-vindo, ${displayName}!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Sua matrícula na turma <strong style="color:#111827;">${cohortName}</strong> foi confirmada.
                Você já tem acesso completo ao sistema.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#7a1d91;border-radius:10px;">
                    <a href="${APP_URL}/app"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-.2px;">
                      Entrar no sistema →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- What's included -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f9f5ff;border-radius:8px;padding:20px;margin-bottom:28px;">
                <tr>
                  <td>
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7a1d91;">
                      O que está incluso
                    </p>
                    ${[
                      "Questões comentadas e simulados",
                      "Resumos narrativos por especialidade",
                      "MedVoice — treinamento em áudio",
                      "Audiocards e Flashcards",
                      "Fórmula MedHelp",
                      "MedHelp 60D — liberado 60 dias antes da prova",
                    ]
                      .map(
                        (item) =>
                          `<p style="margin:0 0 6px;font-size:13.5px;color:#374151;">✓ &nbsp;${item}</p>`,
                      )
                      .join("")}
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                Dúvidas? Responda este e-mail ou entre em contato pelo WhatsApp.<br/>
                Garantia incondicional de 7 dias — sem burocracia.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
              <p style="margin:0 0 8px;font-size:11.5px;color:#9ca3af;line-height:1.5;">
                MedHelpSpace Revalida &nbsp;·&nbsp;
                <a href="${APP_URL}" style="color:#7a1d91;text-decoration:none;">medhelpspace.com.br</a>
              </p>
              <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5;">
                CNPJ CNPJ_TO_FILL_IN &nbsp;·&nbsp; Contato:
                <a href="mailto:privacidade@medhelpspace.com.br" style="color:#9ca3af;text-decoration:underline;">privacidade@medhelpspace.com.br</a>
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">
                Para gerenciar suas notificações por email, acesse suas
                <a href="${APP_URL}/app/configuracoes" style="color:#9ca3af;text-decoration:underline;">configurações de conta</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
