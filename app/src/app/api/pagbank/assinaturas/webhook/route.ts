import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/pagbank/rate-limit";
import { getSubscription } from "@/lib/pagbank/subscriptions";
import { findClinactSubscription, reconcileClinactSubscription } from "@/lib/clinact/renewals";
import {
  readSignatureHeader,
  verifySubscriptionsWebhookSignature,
} from "@/lib/pagbank/subscriptions-webhook-auth";

// PagBank Pagamentos Recorrentes notification endpoint (ClinAct subscriptions).
//
// SEPARATE FROM /api/pagbank/webhook ON PURPOSE. That route serves the live
// Revalida checkout (Orders API) and must not change because of anything here.
// This one is additive: the only existing table it writes is
// user_product_access, and only through the forward-only grant in point 4.
//
// What it does, and deliberately does not do:
//   1. Per-IP rate limit, same helper as the Orders route.
//   2. Records the authenticity check WITHOUT gating on it. These webhooks
//      carry `x-payload-signature` (observed 2026-09-17 — PagBank documents no
//      signature at all for them), and the algorithm is still unconfirmed, so
//      the check reports while we identify it.
//   3. NEVER trusts the payload's status: it re-reads the subscription from the
//      authenticated API, which a forged body cannot influence.
//   4. EXTENDS ACCESS — but only from what PagBank's authenticated API says,
//      never from the body. For a subscription that is one of ours, it runs
//      the same reconciliation as the daily cron (lib/clinact/renewals.ts):
//      read the subscription and its invoices back, decide with the tested
//      renewalDecision rule, extend forward-only. A forged event can therefore
//      only make us re-check a real subscription — it cannot create a paid
//      state or a grant. That is the same reasoning the Orders route documents
//      (its re-fetch, not its signature, is the real gate), and it is why the
//      unverifiable ECDSA signature does not block this.
//      The cron is the source of truth; this is the fast path, so a renewal
//      shows up in minutes instead of the next morning.
//   5. Always answers 200 {ok:true}: a uniform reply reveals nothing about
//      which subscription ids are ours, and stops PagBank retrying a delivery
//      we have already stored.
//
// Customer and plan events arrive here too (`customer.created`,
// `customer.billing_info.updated`, `plan.created`), so `resource.id` is not
// always a subscription id — it can be a CUST_… or PLAN_… id, and the API
// re-read and reconciliation are skipped for those.
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

  // Fast path for renewals. Only for subscriptions we actually own, and only
  // ever from an authenticated re-read — see point 4 above.
  if (resourceId?.startsWith("SUBS_")) {
    try {
      const row = await findClinactSubscription(resourceId);
      if (row) await reconcileClinactSubscription(row);
    } catch (err) {
      // The daily cron will catch it; PagBank must still get its 200.
      console.error("assinaturas webhook: reconcile failed", resourceId, err);
    }
  }

  return NextResponse.json({ ok: true });
}
