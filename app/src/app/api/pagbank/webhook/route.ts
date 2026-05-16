import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge } from "@/lib/pagbank/api";
import { sendPurchaseConfirmation } from "@/lib/email";

// PagBank sends webhook notifications when a charge status changes.
// We always verify by re-fetching the charge from PagBank rather than
// trusting the webhook payload, preventing spoofed notifications.
export async function POST(request: NextRequest) {
  let payload: { id?: string; reference_id?: string };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const chargeId = payload?.id;
  if (!chargeId || !chargeId.startsWith("CHAR_")) {
    // Not a charge notification (PagBank also sends other event types)
    return NextResponse.json({ ok: true });
  }

  // Verify by fetching from PagBank directly
  let charge;
  try {
    charge = await getCharge(chargeId);
  } catch (err) {
    console.error("Webhook: failed to fetch charge", chargeId, err);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const admin = createAdminClient();

  // Find order by pagbank_charge_id
  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, cohort_id, status")
    .eq("pagbank_charge_id", chargeId)
    .maybeSingle();

  if (!order) {
    // Unknown charge — could be from a prior system; log and ignore
    console.warn("Webhook: order not found for charge", chargeId);
    return NextResponse.json({ ok: true });
  }

  const newStatus = mapChargeStatus(charge.status);

  // Only update if status actually changed
  if (order.status !== newStatus) {
    await admin
      .from("orders")
      .update({ status: newStatus, pagbank_response: charge as unknown as Record<string, unknown> })
      .eq("id", order.id);
  }

  // Provision membership and send confirmation email when payment is confirmed
  if (charge.status === "PAID" && order.status !== "paid") {
    await admin
      .from("user_cohort_memberships")
      .upsert(
        { user_id: order.user_id, cohort_id: order.cohort_id },
        { onConflict: "user_id,cohort_id" },
      );

    // Fetch user info for the confirmation email
    const { data: profile } = await admin
      .from("profiles")
      .select("email, display_name")
      .eq("id", order.user_id)
      .single();
    const { data: cohort } = await admin
      .from("cohorts")
      .select("name")
      .eq("id", order.cohort_id)
      .single();

    if (profile?.email) {
      sendPurchaseConfirmation({
        to: profile.email as string,
        name: (profile.display_name as string | null) ?? "",
        cohortName: (cohort?.name as string | null) ?? "",
      }).catch((err) => console.error("Email send failed:", err));
    }
  }

  return NextResponse.json({ ok: true });
}

function mapChargeStatus(s: string): string {
  switch (s) {
    case "PAID":
    case "AUTHORIZED":
      return "paid";
    case "DECLINED":
      return "declined";
    case "CANCELED":
      return "cancelled";
    case "REFUNDED":
    case "CHARGEBACK":
      return "refunded";
    default:
      return "pending";
  }
}
