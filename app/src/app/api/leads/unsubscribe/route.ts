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

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  if (!token) {
    return page("Link inválido. Nenhuma alteração foi feita.");
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!lead) {
    return page("Este link não é mais válido. Nenhuma alteração foi feita.");
  }

  await admin
    .from("leads")
    .update({ drip_status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", lead.id);

  return page(
    "Pronto — você não vai mais receber nossos e-mails. Sentiremos sua falta. Boa prova!",
  );
}
