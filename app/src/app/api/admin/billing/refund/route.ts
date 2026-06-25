import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAlert, formatBRL } from "@/lib/admin-notify";

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

  // PagBank requires amount.value on /cancel even for a FULL refund — an empty
  // body is rejected with HTTP 400 ("amount.value required"). We refund the full
  // settled amount (amount_cents was reconciled to equal the charge in
  // finalize.ts), in centavos.
  const pbRes = await fetch(`${baseUrl}/charges/${chargeId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amount: { value: order.amount_cents } }),
  });

  if (!pbRes.ok) {
    const errBody = await pbRes.text();
    console.error("PagBank refund failed:", pbRes.status, errBody);
    // Surface PagBank's own validation message (error_messages[].description)
    // so an operator sees *why*, not just the status code.
    let detail = "";
    try {
      const parsed = JSON.parse(errBody) as {
        error_messages?: { description?: string; parameter_name?: string }[];
      };
      detail = (parsed.error_messages ?? [])
        .map((m) => [m.parameter_name, m.description].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("; ");
    } catch {
      /* non-JSON body — fall back to the status code alone */
    }
    return NextResponse.json(
      { error: `PagBank recusou o estorno: ${pbRes.status}${detail ? ` — ${detail}` : ""}` },
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

  // Alert admins of the refund — instant emails to opted-in admins + an
  // admin_alerts row for the daily digest. Best-effort: the money already moved,
  // so a failed alert must not surface as a refund failure to the operator.
  try {
    const [{ data: buyer }, { data: cohort }, { data: actor }] = await Promise.all([
      admin
        .from("profiles")
        .select("email, display_name")
        .eq("id", order.user_id as string)
        .maybeSingle(),
      admin.from("cohorts").select("name").eq("id", order.cohort_id as number).maybeSingle(),
      admin.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle(),
    ]);
    const buyerName =
      ((buyer?.display_name as string | null) ||
        (buyer?.email as string | null)?.split("@")[0] ||
        "Aluno") as string;
    const actorName =
      ((actor?.display_name as string | null) ||
        (actor?.email as string | null)?.split("@")[0] ||
        "Admin") as string;
    await recordAdminAlert({
      event: "refund",
      title: `Estorno — ${cohort?.name ?? "turma"} (${formatBRL(order.amount_cents as number)})`,
      body: `${actorName} estornou a compra de ${buyerName}.`,
      metadata: {
        order_id: orderId,
        charge_id: chargeId,
        amount_cents: order.amount_cents,
        actor_user_id: user.id,
        reason: reason || null,
      },
      contextId: orderId,
      emailVars: {
        buyerName,
        buyerEmail: (buyer?.email as string | null) ?? "—",
        cohortName: (cohort?.name as string | null) ?? "—",
        amount: formatBRL(order.amount_cents as number),
        actorName,
        reason: reason || "—",
        orderId,
      },
    });
  } catch (e) {
    console.error("admin refund alert failed", orderId, e);
  }

  return NextResponse.json({ ok: true });
}
