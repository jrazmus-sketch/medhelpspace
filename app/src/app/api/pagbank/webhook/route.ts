import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge } from "@/lib/pagbank/api";
import { verifyPagBankSignature } from "@/lib/pagbank/webhook-auth";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";

// PagBank notification endpoint.
//
// Defense layers:
//   1. Per-IP rate limit (best-effort, per-instance Map).
//   2. x-authenticity-token signature check when PAGBANK_WEBHOOK_TOKEN is set.
//      Until the token is configured, we accept unsigned requests but log a
//      warning — the re-fetch below still prevents *state* spoofing.
//   3. Always re-fetch the charge from PagBank rather than trusting payload.
//   4. Uniform { ok: true } for unknown chargeIds → prevents enumeration of
//      live charge IDs via response timing/shape.
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: true }, { status: 429 });
  }

  // Read raw body once so we can both signature-verify and JSON-parse it.
  const rawBody = await request.text();

  const authResult = verifyPagBankSignature(
    rawBody,
    request.headers.get("x-authenticity-token"),
  );
  if (authResult === "invalid" || authResult === "missing-header") {
    // Return generic 200 — don't leak whether the signature was wrong vs.
    // some other reason. Log internally for monitoring.
    console.warn("Webhook signature rejected:", authResult, "ip=", ip);
    return NextResponse.json({ ok: true });
  }
  if (authResult === "unconfigured") {
    console.warn(
      "PAGBANK_WEBHOOK_TOKEN not set — accepting webhook without signature check. Set it before launch.",
    );
  }

  let payload: { id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chargeId = payload?.id;
  if (!chargeId || !chargeId.startsWith("CHAR_")) {
    return NextResponse.json({ ok: true });
  }

  let charge;
  try {
    charge = await getCharge(chargeId);
  } catch (err) {
    console.error("Webhook: failed to fetch charge", chargeId, err);
    // Generic 200 even on PagBank fetch failure — they will retry. A 502 here
    // would reveal whether the chargeId exists on PagBank's side.
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, cohort_id, status")
    .eq("pagbank_charge_id", chargeId)
    .maybeSingle();

  if (!order) {
    // Uniform response — do not reveal whether the chargeId is one of ours.
    return NextResponse.json({ ok: true });
  }

  if (charge.status === "PAID") {
    await finalizePaidOrder(admin, {
      orderId: order.id as string,
      userId: order.user_id as string,
      cohortId: order.cohort_id as number,
      charge,
    });
  } else {
    const newStatus = mapChargeStatus(charge.status);
    if (order.status !== newStatus && order.status !== "paid") {
      await admin
        .from("orders")
        .update({
          status: newStatus,
          pagbank_response: charge as unknown as Record<string, unknown>,
        })
        .eq("id", order.id)
        .neq("status", "paid");
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
