import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "MedHelpSpace <pagamentos@medhelpspace.com.br>";

export async function sendPurchaseConfirmation({
  to,
  name,
  cohortName,
}: {
  to: string;
  name: string;
  cohortName: string;
}) {
  if (!process.env.RESEND_API_KEY) return; // silently skip in dev without key

  const displayName = name || to.split("@")[0];

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Acesso liberado — MedHelpSpace Revalida ${cohortName}`,
    html: purchaseConfirmationHtml({ displayName, cohortName }),
  });
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
                    <a href="https://medhelpspace.com.br/app"
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
              <p style="margin:0;font-size:11.5px;color:#9ca3af;line-height:1.5;">
                MedHelpSpace Revalida &nbsp;·&nbsp;
                <a href="https://medhelpspace.com.br" style="color:#7a1d91;text-decoration:none;">medhelpspace.com.br</a>
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
