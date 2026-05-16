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

  let body: { orderId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const { orderId } = body;
  if (!orderId) {
    return NextResponse.json({ error: "orderId obrigatório" }, { status: 400 });
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, pagbank_charge_id, user_id, cohort_id, amount_cents")
    .eq("id", orderId)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (order.status !== "paid") {
    return NextResponse.json({ error: "Só pedidos pagos podem ser estornados" }, { status: 409 });
  }

  const chargeId = order.pagbank_charge_id as string | null;
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

  return NextResponse.json({ ok: true });
}
