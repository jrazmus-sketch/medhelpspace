/**
 * The sign-up confirmation e-mail for a person who started in ClinAct
 * (Karina 2026-11-03: "MedHelpSpace | ClinAct", never Revalida). Supabase's
 * own template lives in its dashboard, so for ClinAct the app generates the
 * link itself (auth.admin.generateLink — no Supabase e-mail goes out) and
 * sends this. Same layout as docs/auth-email-templates/confirmation.html;
 * only the header mark differs. The header is an <img> with fixed width and
 * height, which Gmail and Outlook both render.
 *
 * Pure: no server imports.
 */
export const CLINACT_CONFIRMATION_SUBJECT = "Confirme seu cadastro na MedHelpSpace ClinAct";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function clinactConfirmationEmailHtml(link: string, appUrl: string): string {
  const href = esc(link);
  const wordmark = `${appUrl.replace(/\/$/, "")}/brand/medhelpspace-clinact-wordmark-email.png`;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Confirme seu cadastro</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#7a1d91;padding:24px 32px;">
              <img src="${wordmark}"
                alt="MedHelpSpace ClinAct" width="227" height="23"
                style="display:block;border:0;line-height:100%;outline:none;text-decoration:none;width:227px;height:23px;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-.4px;line-height:1.2;">Confirme seu e-mail</p>
              <div style="font-size:15px;color:#4b5563;line-height:1.65;">
                <p style="margin:0 0 16px;">Falta só um passo para ativar sua conta no MedHelpSpace ClinAct. Toque no botão abaixo para confirmar este endereço de e-mail — você volta direto para onde estava.</p>
              </div>
              <table cellpadding="0" cellspacing="0" style="margin-top:8px;margin-bottom:8px;">
                <tr>
                  <td style="background:#7a1d91;border-radius:10px;">
                    <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-.2px;">Confirmar meu e-mail</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">Se o botão não funcionar, copie e cole este endereço no navegador:<br />
                <a href="${href}" style="color:#7a1d91;word-break:break-all;">${href}</a></p>
              <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">O link só pode ser usado uma vez. Se você não criou uma conta no MedHelpSpace ClinAct, ignore este e-mail.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f0f0f0;font-size:12px;color:#9ca3af;line-height:1.6;">
              MedHelpSpace ClinAct · <a href="mailto:contato@medhelpspace.com.br" style="color:#9ca3af;">contato@medhelpspace.com.br</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
