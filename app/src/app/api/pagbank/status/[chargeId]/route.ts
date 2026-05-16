import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge } from "@/lib/pagbank/api";
import { sendPurchaseConfirmation } from "@/lib/email";

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

  // Verify the order belongs to this user
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, user_id")
    .eq("pagbank_charge_id", chargeId)
    .maybeSingle();

  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  // If already paid in DB, no need to call PagBank
  if (order.status === "paid") {
    return NextResponse.json({ status: "PAID", paid: true });
  }

  // Fetch live status from PagBank
  let charge;
  try {
    charge = await getCharge(chargeId);
  } catch (err) {
    console.error("Status poll failed:", err);
    return NextResponse.json({ error: "Erro ao consultar PagBank" }, { status: 502 });
  }

  // If now paid, provision immediately (webhook backup)
  if (charge.status === "PAID" && order.status !== "paid") {
    await admin
      .from("orders")
      .update({ status: "paid", pagbank_response: charge as unknown as Record<string, unknown> })
      .eq("id", order.id);

    const { data: orderFull } = await admin
      .from("orders")
      .select("cohort_id")
      .eq("id", order.id)
      .single();

    if (orderFull) {
      await admin
        .from("user_cohort_memberships")
        .upsert(
          { user_id: user.id, cohort_id: orderFull.cohort_id },
          { onConflict: "user_id,cohort_id" },
        );

      // Send confirmation email (fire-and-forget; webhook may also send it, upsert handles dedup)
      const { data: profile } = await admin
        .from("profiles")
        .select("email, display_name")
        .eq("id", user.id)
        .single();
      const { data: cohort } = await admin
        .from("cohorts")
        .select("name")
        .eq("id", orderFull.cohort_id)
        .single();

      if (profile?.email) {
        sendPurchaseConfirmation({
          to: profile.email as string,
          name: (profile.display_name as string | null) ?? "",
          cohortName: (cohort?.name as string | null) ?? "",
        }).catch((err) => console.error("Email send failed:", err));
      }
    }
  }

  return NextResponse.json({ status: charge.status, paid: charge.status === "PAID" });
}
