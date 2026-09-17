import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { getSubscription } from "@/lib/pagbank/subscriptions";
import {
  readSignatureHeader,
  verifySubscriptionsWebhookSignature,
} from "@/lib/pagbank/subscriptions-webhook-auth";

// PagBank Pagamentos Recorrentes notification endpoint (ClinAct subscriptions).
//
// SEPARATE FROM /api/pagbank/webhook ON PURPOSE. That route serves the live
// Revalida checkout (Orders API) and must not change because of anything here.
// This one is new, additive, and touches no existing table.
//
// What it does, and deliberately does not do:
//   1. Per-IP rate limit, same helper as the Orders route.
//   2. Records the authenticity check WITHOUT gating on it. These webhooks
//      carry `x-payload-signature` (observed 2026-09-17 — PagBank documents no
//      signature at all for them), and the algorithm is still unconfirmed, so
//      the check reports while we identify it.
//   3. NEVER trusts the payload's status: it re-reads the subscription from the
//      authenticated API, which a forged body cannot influence.
//   4. GRANTS NOTHING. No access is written anywhere. When the subscription
//      checkout lands and this route starts moving `user_product_access`, the
//      signature check MUST be made to fail closed first, exactly like the
//      Orders route does today.
//   5. Always answers 200 {ok:true}: a uniform reply reveals nothing about
//      which subscription ids are ours, and stops PagBank retrying a delivery
//      we have already stored.
//
// Events seen so far include two PagBank does not document: `customer.created`
// and `customer.billing_info.updated`. `resource.id` is therefore not always a
// subscription id — for customer events it is a CUST_… id, so the API re-read
// is skipped for those.
//
// Node runtime: the admin Supabase client uses the service-role key and the
// signature check uses node:crypto.
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: true }, { status: 429 });
  }

  // Read the raw body once: the signature is over the bytes as sent.
  const rawBody = await request.text();
  const signature = readSignatureHeader(request.headers);
  const auth = verifySubscriptionsWebhookSignature(rawBody, signature);

  // Header NAMES only — one of these carries the signature, and this is
  // discovery, not surveillance.
  const headerNames = [...request.headers.keys()].sort();

  let payload: { event?: string; resource?: { id?: string; reference_id?: string } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const event = payload?.event;
  const resourceId = payload?.resource?.id ?? null;
  if (!event) {
    return NextResponse.json({ ok: true });
  }

  // The authoritative status comes from the API, never from the body. Only
  // subscription events carry a subscription id.
  let status: string | null = null;
  if (resourceId?.startsWith("SUBS_")) {
    try {
      status = (await getSubscription(resourceId)).status;
    } catch {
      // Leave it null: the event is still worth recording, and PagBank will
      // retry. Never surface the failure — it would leak which ids exist.
    }
  }

  try {
    const admin = createAdminClient();
    await admin.from("clinact_subscription_events").insert({
      event,
      subscription_id: resourceId,
      reference_id: payload?.resource?.reference_id ?? null,
      status,
      signature: auth.result,
      signature_format: auth.format,
      signature_header: auth.header,
      signature_sample: auth.sample,
      header_names: headerNames,
      payload: JSON.parse(rawBody) as Record<string, unknown>,
    });
  } catch (err) {
    // Recording is best-effort; PagBank must still get its 200.
    console.error("assinaturas webhook: insert failed", event, resourceId, err);
  }

  return NextResponse.json({ ok: true });
}
