import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  // Auth + role check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["super_admin", "billing_admin"].includes(profile.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  let body: { orderId: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  // Reason is optional but recorded for the audit trail. Cap the length so a
  // pasted blob can't bloat the audit_log details JSON.
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const { data: order } = await admin
    .from("orders")
    .select("id, status, pagbank_charge_id, pagbank_response, user_id, cohort_id, amount_cents")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (order.status !== "paid") {
    return NextResponse.json({ error: "Só pedidos pagos podem ser estornados" }, { status: 409 });
  }

  // Card orders persist the charge id at charge-create time; Pix orders only get
  // it once finalize.ts flips them to paid. For older Pix orders predating that
  // fix, recover it from the stored charge snapshot (pagbank_response is the
  // settled PagBankCharge, so .id is the CHAR_… we cancel).
  const responseChargeId =
    (order.pagbank_response as { id?: string } | null)?.id ?? null;
  const chargeId = (order.pagbank_charge_id as string | null) ?? responseChargeId;
  if (!chargeId) {
    return NextResponse.json({ error: "Charge ID do PagBank não encontrado" }, { status: 422 });
  }

  // Call PagBank refund endpoint
  const env = process.env.PAGBANK_ENVIRONMENT ?? "production";
  const token = env === "sandbox"
    ? process.env.PAGBANK_ACCESS_TOKEN_SANDBOX
    : process.env.PAGBANK_ACCESS_TOKEN;
  const baseUrl = env === "sandbox"
    ? "https://sandbox.api.pagseguro.com"
    : "https://api.pagseguro.com";

  const pbRes = await fetch(`${baseUrl}/charges/${chargeId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}), // full refund
  });

  if (!pbRes.ok) {
    const errBody = await pbRes.text();
    console.error("PagBank refund failed:", pbRes.status, errBody);
    return NextResponse.json(
      { error: `PagBank recusou o estorno: ${pbRes.status}` },
      { status: 502 },
    );
  }

  // Update order status and revoke membership
  await Promise.all([
    admin.from("orders").update({ status: "refunded" }).eq("id", orderId),
    admin
      .from("user_cohort_memberships")
      .delete()
      .eq("user_id", order.user_id as string)
      .eq("cohort_id", order.cohort_id as number),
  ]);

  // Audit trail (best-effort — the money has already moved, so a failed log
  // must not surface as a refund failure to the operator).
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    actor_user_id: user.id,
    action: "order_refunded",
    target_user_id: order.user_id as string,
    details: {
      order_id: orderId,
      charge_id: chargeId,
      amount_cents: order.amount_cents,
      payment_method_charge_id_source: order.pagbank_charge_id ? "column" : "response",
      reason: reason || null,
    },
  });
  if (auditErr) {
    console.error("Refund audit log failed:", orderId, auditErr);
  }

  return NextResponse.json({ ok: true });
}
