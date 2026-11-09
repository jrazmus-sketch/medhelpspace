import "server-only";

import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/pagbank/rate-limit";
import { INTERNAL_TRAFFIC_COOKIE } from "@/lib/analytics/config";
import {
  ADS_CONSENT_COOKIE,
  META_PIXEL_ID,
  META_PIXEL_LIVE,
  META_TEST_COOKIE,
  isValidMetaTestCode,
} from "./config";
import {
  asContext,
  buildMirrorPayload,
  buildPurchasePayload,
  type MetaContext,
  type MirrorEvent,
} from "./capi-payload";

export type { MetaContext };

// Meta Conversions API — the server half of the Pixel (Karina 2026-11-04 / 09).
//
// PURCHASE IS SENT ONLY FROM HERE, and only when PagBank has confirmed the money:
//   - Revalida: from finalizePaidOrder, by the caller that WON the paid flip;
//   - ClinAct: from recordPaidInvoices, for a subscription's FIRST paid invoice
//     (occurrence 1) — never a renewal.
// The browser redirect never sends one, so a refresh / back-button / replayed
// PagBank notification cannot create a sale, and there is no browser Purchase to
// deduplicate against. `meta_capi_events` (event_id PK) makes a second send
// impossible even when two confirmations race.
//
// WHAT IS SENT: event, value in BRL, product + turma/plan, and to match the
// buyer: e-mail and phone HASHED (SHA-256, Meta's standard), hashed user id,
// the _fbp/_fbc cookies, IP and browser user agent from the checkout request.
// NEVER: card data, CPF, names, addresses, clinical content or student answers.
//
// CONSENT: the context is frozen at checkout ONLY when the buyer had accepted
// advertising cookies (mhs_ads_consent=granted). No context = nothing is sent.
// Admin / internal buyers are excluded unless the browser is a Test Events one,
// whose code then rides on the event so it never reaches the campaigns.
//
// Every function here swallows its own failures: tracking must never touch a
// payment, a grant or a subscription.

const GRAPH_VERSION = "v24.0";
const TIMEOUT_MS = 5000;
/** Meta refuses events older than 7 days. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function pageUrl(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * The context to freeze on the order / subscription, or null when no Purchase
 * may ever be sent for it. Call from the checkout route (the buyer's request).
 */
export async function captureMetaContext(
  request: NextRequest,
  userId: string | null,
  pageUrlOverride?: string | null,
): Promise<MetaContext | null> {
  try {
    const test = request.cookies.get(META_TEST_COOKIE)?.value ?? null;
    const testCode = isValidMetaTestCode(test) ? test.toUpperCase() : null;
    if (!META_PIXEL_LIVE && !testCode) return null;
    if (request.cookies.get(ADS_CONSENT_COOKIE)?.value !== "granted") return null;

    if (!testCode) {
      if (request.cookies.get(INTERNAL_TRAFFIC_COOKIE)?.value === "1") return null;
      if (userId) {
        const { data: profile } = await createAdminClient()
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.role && profile.role !== "member") return null;
      }
    }

    const ip = getClientIp(request.headers);
    return {
      v: 1,
      fbp: request.cookies.get("_fbp")?.value ?? null,
      fbc: request.cookies.get("_fbc")?.value ?? null,
      ip: ip && ip !== "unknown" ? ip : null,
      ua: request.headers.get("user-agent"),
      url: pageUrl(pageUrlOverride ?? request.headers.get("referer")),
      test_event_code: testCode,
      captured_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error("meta capi: capture failed", err);
    return null;
  }
}

/**
 * Server mirror of a browser PageView / InitiateCheckout (same event_id, so
 * Meta deduplicates). Same gates as the Pixel: consent, live-or-test, not an
 * internal browser. No DB claim — these are not sales; Meta's event_id dedup
 * is enough. Returns Meta's answer for logging only.
 */
export async function sendMirrorEvent(
  request: NextRequest,
  input: { eventName: MirrorEvent; eventId: string; pageUrl: string; userId: string | null; customData: Record<string, unknown> },
): Promise<{ sent: boolean; status?: number }> {
  try {
    const token = process.env.META_CAPI_ACCESS_TOKEN;
    if (!token) return { sent: false };
    const context = await captureMetaContext(request, input.userId, input.pageUrl);
    if (!context) return { sent: false };
    const body = buildMirrorPayload({
      eventName: input.eventName,
      eventId: input.eventId,
      userId: input.userId,
      context,
      customData: input.customData,
      eventTime: Math.floor(Date.now() / 1000),
    });
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.error("meta capi: mirror refused", input.eventName, res.status, await res.json().catch(() => null));
    } else if (process.env.NODE_ENV !== "production") {
      console.info("meta capi: mirror sent", input.eventName, input.eventId, context.test_event_code ?? "live");
    }
    return { sent: res.ok, status: res.status };
  } catch (err) {
    console.error("meta capi: mirror failed", input.eventName, err);
    return { sent: false };
  }
}

async function sendPurchase(input: {
  eventId: string;
  product: "revalida" | "clinact";
  valueCents: number;
  userId: string;
  email: string | null;
  phone: string | null;
  context: MetaContext;
  customData: Record<string, unknown>;
}): Promise<void> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) {
    console.error("meta capi: META_CAPI_ACCESS_TOKEN not set — Purchase not sent", input.eventId);
    return;
  }
  if (!(input.valueCents > 0)) return;

  const admin = createAdminClient();
  // The claim. A second confirmation for the same purchase stops here.
  const { error: claimErr } = await admin.from("meta_capi_events").insert({
    event_id: input.eventId,
    event_name: "Purchase",
    product: input.product,
    value_cents: input.valueCents,
    user_id: input.userId,
    test_event_code: input.context.test_event_code,
  });
  if (claimErr) {
    if (claimErr.code !== "23505") console.error("meta capi: claim failed", input.eventId, claimErr);
    return;
  }

  const body = buildPurchasePayload({ ...input, eventTime: Math.floor(Date.now() / 1000) });
  let status = 0;
  let response: unknown = null;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    status = res.status;
    response = await res.json().catch(() => null);
    if (!res.ok) console.error("meta capi: Purchase refused", input.eventId, status, response);
  } catch (err) {
    response = { error: String(err) };
    console.error("meta capi: Purchase send failed", input.eventId, err);
  }
  await admin
    .from("meta_capi_events")
    .update({ http_status: status, response: response as Record<string, unknown> | null, sent_at: new Date().toISOString() })
    .eq("event_id", input.eventId);
}

/**
 * Revalida — call ONLY after this caller won the order's flip to 'paid'.
 * Skips: no consent context, R$ 0 (Matrícula gratuita), internal tests.
 */
export async function sendRevalidaPurchase(orderId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: order } = await admin
      .from("orders")
      .select("user_id, cohort_id, amount_cents, payment_method, billing_phone, meta_capi, internal_test, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || order.status !== "paid" || order.internal_test) return;
    const context = asContext(order.meta_capi);
    if (!context) return;
    if (Date.now() - new Date(context.captured_at).getTime() > MAX_AGE_MS) return;

    const [{ data: cohort }, { data: profile }] = await Promise.all([
      admin.from("cohorts").select("slug, name").eq("id", order.cohort_id).maybeSingle(),
      admin.from("profiles").select("email").eq("id", order.user_id).maybeSingle(),
    ]);
    const slug = (cohort?.slug as string | null) ?? String(order.cohort_id);
    await sendPurchase({
      eventId: `revalida_${orderId}`,
      product: "revalida",
      valueCents: order.amount_cents as number,
      userId: order.user_id as string,
      email: (profile?.email as string | null) ?? null,
      phone: (order.billing_phone as string | null) ?? null,
      context,
      customData: {
        content_ids: [`revalida_${slug}`],
        content_name: (cohort?.name as string | null) ?? slug,
        product: "revalida",
        turma: slug,
        order_id: orderId,
        payment_type: order.payment_method,
      },
    });
  } catch (err) {
    console.error("meta capi: revalida purchase failed", orderId, err);
  }
}

type PaidInvoiceLike = { id: string; status?: string; occurrence?: number; amount?: { value?: number } };

/**
 * ClinAct — called with the PAID invoices of one subscription. Sends a Purchase
 * only for that subscription's first charge (occurrence 1); renewals never.
 */
export async function sendClinactFirstPurchase(
  userId: string,
  subscriptionId: string,
  paidInvoices: PaidInvoiceLike[],
): Promise<void> {
  try {
    const first = paidInvoices.find((i) => i.status === "PAID" && (i.occurrence ?? 1) === 1);
    if (!first) return;
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("clinact_subscriptions")
      .select("pagbank_subscription_id, plan_key, billing_phone, meta_capi")
      .eq("user_id", userId)
      .maybeSingle();
    // The context belongs to the row's CURRENT subscription only.
    if (!sub || sub.pagbank_subscription_id !== subscriptionId) return;
    const context = asContext(sub.meta_capi);
    if (!context) return;
    if (Date.now() - new Date(context.captured_at).getTime() > MAX_AGE_MS) return;

    const { data: profile } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
    const plan = sub.plan_key === "anual" ? "annual" : "monthly";
    await sendPurchase({
      eventId: `clinact_${subscriptionId}`,
      product: "clinact",
      valueCents: first.amount?.value ?? 0,
      userId,
      email: (profile?.email as string | null) ?? null,
      phone: (sub.billing_phone as string | null) ?? null,
      context,
      customData: {
        content_ids: [`clinact_${plan}`],
        content_name: `ClinAct ${plan === "annual" ? "anual" : "mensal"}`,
        product: "clinact",
        plan,
        payment_type: "card",
      },
    });
  } catch (err) {
    console.error("meta capi: clinact purchase failed", subscriptionId, err);
  }
}
