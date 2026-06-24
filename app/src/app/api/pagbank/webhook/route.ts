import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCharge, getOrder } from "@/lib/pagbank/api";
import type { PagBankCharge } from "@/lib/pagbank/types";
import { verifyPagBankSignature } from "@/lib/pagbank/webhook-auth";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";

// PagBank notification endpoint.
//
// Defense layers:
//   1. Per-IP rate limit (best-effort, per-instance Map).
//   2. x-authenticity-token signature check — FAILS CLOSED by default: any
//      event that doesn't verify "valid" is rejected. The only opt-out is the
//      escape hatch PAGBANK_WEBHOOK_ENFORCE=false (temporary pre-launch window).
//      The re-fetch below additionally prevents *state* spoofing.
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
  // The charge/order re-fetch below is the real gate (a forged payload can't fake
  // a PAID status — that comes from PagBank's authenticated API, not the body), so
  // an unsigned event can never grant access. The signature is defense-in-depth
  // against the residual amplification surface (forcing outbound API calls).
  //
  // FAIL CLOSED by default: any event that isn't "valid" is rejected here. This
  // never blocks revenue — legit paid memberships also finalize via the Pix
  // status-poll path (/api/pagbank/status/[chargeId]) and the immediate-charge
  // path (/api/pagbank/charge), neither of which depends on the webhook.
  //
  // The ONLY opt-out is PAGBANK_WEBHOOK_ENFORCE=false, intended as a temporary
  // pre-launch verification window while we confirm a genuine PagBank webhook
  // signs "valid" in prod (the signing format is still unverified — see
  // webhook-auth.ts). Anything other than the literal string "false" keeps
  // enforcement ON, so a missing/typo'd env var stays secure.
  if (authResult !== "valid") {
    const enforce = process.env.PAGBANK_WEBHOOK_ENFORCE !== "false";
    console.warn(
      "PagBank webhook signature not 'valid':",
      authResult,
      "ip=",
      ip,
      "enforce=",
      enforce,
    );
    if (enforce) {
      // Generic 200 — never reveal whether the signature was wrong vs. some other
      // reason (no enumeration signal to probers); also avoids PagBank retries.
      return NextResponse.json({ ok: true });
    }
  }

  let payload: { id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // PagBank notifies us with either a charge id (CHAR_… — credit card) or an
  // order id (ORDE_… — Pix, via the Orders API). Resolve both to the PagBank
  // charge and the matching local order.
  const notifId = payload?.id;
  if (!notifId) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  let charge: PagBankCharge;
  let order: { id: string; user_id: string; cohort_id: number; status: string } | null = null;

  try {
    if (notifId.startsWith("CHAR_")) {
      charge = await getCharge(notifId);
      const { data } = await admin
        .from("orders")
        .select("id, user_id, cohort_id, status")
        .eq("pagbank_charge_id", notifId)
        .maybeSingle();
      order = data;
    } else if (notifId.startsWith("ORDE_")) {
      const pbOrder = await getOrder(notifId);
      // The order's charges[] is empty until paid; pick the settled one.
      const paid = pbOrder.charges?.find((c) => c.status === "PAID");
      const resolved = paid ?? pbOrder.charges?.[0];
      if (!resolved) {
        // QR not paid yet — nothing to do.
        return NextResponse.json({ ok: true });
      }
      charge = resolved;
      const { data } = await admin
        .from("orders")
        .select("id, user_id, cohort_id, status")
        .eq("pagbank_order_id", notifId)
        .maybeSingle();
      order = data;
    } else {
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("Webhook: failed to fetch charge/order", notifId, err);
    // Generic 200 even on PagBank fetch failure — they will retry. A 502 here
    // would reveal whether the id exists on PagBank's side.
    return NextResponse.json({ ok: true });
  }

  if (!order) {
    // Uniform response — do not reveal whether the id is one of ours.
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
