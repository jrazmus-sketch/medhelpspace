import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// One-click unsubscribe for magnet leads (FREE-FUNNEL-BUILD-SPEC §7). The token is
// the auth — anyone with a lead's unsubscribe_token can stop its drip. No login.

export const dynamic = "force-dynamic";

function page(message: string): Response {
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Cancelar e-mails — MedHelpSpace</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0c0c0f;color:#e5e7eb;">
<div style="max-width:480px;margin:18vh auto;padding:0 24px;text-align:center;">
<p style="font-size:18px;font-weight:700;color:#c084e8;margin:0 0 12px;">MedHelpSpace</p>
<p style="font-size:15px;line-height:1.6;color:#cbd5e1;">${message}</p>
<p style="margin-top:20px;"><a href="https://medhelpspace.com.br" style="color:#c084e8;font-size:13px;">Voltar ao site →</a></p>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Shared action for GET (browser click) and POST (mail-client one-click). Idempotent:
// re-unsubscribing an already-unsubscribed lead just re-stamps it.
async function unsubscribeByToken(
  token: string | null,
): Promise<"ok" | "invalid" | "notfound"> {
  if (!token) return "invalid";
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (!lead) return "notfound";
  await admin
    .from("leads")
    .update({ drip_status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", lead.id);
  return "ok";
}

export async function GET(request: NextRequest) {
  const result = await unsubscribeByToken(request.nextUrl.searchParams.get("t"));
  if (result === "invalid") {
    return page("Link inválido. Nenhuma alteração foi feita.");
  }
  if (result === "notfound") {
    return page("Este link não é mais válido. Nenhuma alteração foi feita.");
  }
  return page(
    "Pronto — você não vai mais receber nossos e-mails. Sentiremos sua falta. Boa prova!",
  );
}

// RFC 8058 one-click: with the List-Unsubscribe-Post header, Gmail/Apple Mail/etc.
// POST here directly (no page load) when the user taps the client's unsubscribe
// button. Must act and return 2xx without any further interaction.
export async function POST(request: NextRequest) {
  await unsubscribeByToken(request.nextUrl.searchParams.get("t"));
  return new Response(null, { status: 200 });
}
