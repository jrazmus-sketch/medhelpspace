import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge } from "@/lib/pagbank/api";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";

// Lightweight polling endpoint for the Pix waiting screen.
// Returns { status, paid } so the client knows when to redirect to /app.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chargeId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { chargeId } = await params;
  if (!chargeId || !chargeId.startsWith("CHAR_")) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, user_id, cohort_id")
    .eq("pagbank_charge_id", chargeId)
    .maybeSingle();

  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (order.status === "paid") {
    return NextResponse.json({ status: "PAID", paid: true });
  }

  let charge;
  try {
    charge = await getCharge(chargeId);
  } catch (err) {
    console.error("Status poll failed:", err);
    return NextResponse.json({ error: "Erro ao consultar PagBank" }, { status: 502 });
  }

  if (charge.status === "PAID") {
    // Race-safe finalize (same code path as the webhook). The UPDATE
    // ... WHERE status != 'paid' guard means a concurrent webhook hit
    // will lose the race and skip the email; email_log makes the email
    // doubly safe.
    await finalizePaidOrder(admin, {
      orderId: order.id as string,
      userId: user.id,
      cohortId: order.cohort_id as number,
      charge,
    });
  }

  return NextResponse.json({ status: charge.status, paid: charge.status === "PAID" });
}
