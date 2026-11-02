import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundClinactInvoice } from "@/lib/clinact/refund";

// The "Reembolsar" button of a ClinAct invoice on /admin/notas-fiscais (Karina
// 2026-11-02): cancels the subscription, refunds the payment on PagBank, ends
// access and records who did it and when. Billing tier only — same roles as the
// Revalida refund. All of the work, and its safety rules, live in
// lib/clinact/refund.ts.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["super_admin", "billing_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: { invoiceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }
  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  if (!/^INVO_[0-9A-F-]{36}$/i.test(invoiceId)) {
    return NextResponse.json({ error: "Cobrança inválida" }, { status: 400 });
  }

  const result = await refundClinactInvoice(invoiceId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
