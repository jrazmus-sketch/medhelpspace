import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge, getOrder } from "@/lib/pagbank/api";
import type { PagBankCharge } from "@/lib/pagbank/types";
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

  // CHAR_… = credit card charge; ORDE_… = Pix order (Orders API).
  const { chargeId } = await params;
  const isOrder = chargeId?.startsWith("ORDE_");
  const isCharge = chargeId?.startsWith("CHAR_");
  if (!chargeId || (!isOrder && !isCharge)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, user_id, cohort_id")
    .eq(isOrder ? "pagbank_order_id" : "pagbank_charge_id", chargeId)
    .maybeSingle();

  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  if (order.status === "paid") {
    return NextResponse.json({ status: "PAID", paid: true });
  }

  let charge: PagBankCharge | undefined;
  try {
    if (isOrder) {
      const pbOrder = await getOrder(chargeId);
      // No charge until the QR is paid; treat absence as still-waiting.
      charge = pbOrder.charges?.find((c) => c.status === "PAID") ?? pbOrder.charges?.[0];
    } else {
      charge = await getCharge(chargeId);
    }
  } catch (err) {
    console.error("Status poll failed:", err);
    return NextResponse.json({ error: "Erro ao consultar PagBank" }, { status: 502 });
  }

  if (!charge) {
    // Pix QR generated but not yet paid.
    return NextResponse.json({ status: "WAITING", paid: false });
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
