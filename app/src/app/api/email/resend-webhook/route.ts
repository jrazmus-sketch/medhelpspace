import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend webhook → two jobs:
//
//  1) SUPPRESSION — feed real deliverability signals back into `leads.drip_status`
//     so the verified drip (lead-drip) + pre-verify recovery cron (lead-recovery)
//     automatically stop emailing dead/hostile addresses:
//       email.bounced (Permanent) → drip_status='bounced'      (dead mailbox)
//       email.complained          → drip_status='unsubscribed' (marked us as spam)
//     Transient/soft bounces are IGNORED (Resend retries them; suppressing on a full
//     mailbox would wrongly kill a recoverable address).
//
//  2) ENGAGEMENT LOG — record delivered/opened/clicked/bounced/complained into
//     `lead_email_events`, keyed by the Resend message id, so the /admin/leads detail
//     drawer can show a per-email "delivered → opened → clicked" timeline. Only events
//     whose recipient matches a KNOWN LEAD are logged (member/admin mail is never
//     tracked). 'sent' is recorded at send time (lib/email.ts), so we ignore
//     email.sent here to avoid a duplicate anchor. Requires Open+Click tracking to be
//     enabled in the Resend dashboard + those events subscribed on the webhook.
//
// Security: Resend signs webhooks with Svix. We verify the signature manually
// (no svix dep) over the RAW body and FAIL-CLOSED — an unconfigured secret or a
// bad signature is rejected, mirroring the project's webhook hardening. Configure
// the endpoint at Resend → Webhooks and put its signing secret in
// RESEND_WEBHOOK_SECRET (format: "whsec_<base64>").

export const dynamic = "force-dynamic";

const TOLERANCE_MS = 5 * 60 * 1000; // reject stale/replayed deliveries (±5 min)

// Resend event type → our lead_email_events.event_type. email.sent is deliberately
// absent (logged at send time). Unmapped types are acknowledged and ignored.
const EVENT_MAP: Record<string, string> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
    click?: { link?: string; url?: string };
  };
};

// Svix signature scheme: base64(HMAC-SHA256(secretBytes, `${id}.${ts}.${body}`)).
// The header carries space-separated `v1,<sig>` pairs; any one matching passes.
function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Replay guard: timestamp is unix seconds.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) return false;

  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(key, "base64");
  } catch {
    return false;
  }

  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signed).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");

  // Header: "v1,<b64> v1,<b64>" — accept if any provided v1 signature matches.
  return signature.split(" ").some((part) => {
    const comma = part.indexOf(",");
    const sig = comma === -1 ? part : part.slice(comma + 1);
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: no secret configured ⇒ we cannot trust any caller.
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 401 });
  }

  // RAW body is required for HMAC — read it before any JSON parsing.
  const rawBody = await request.text();
  const ok = verifySvix(
    secret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    rawBody,
  );
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  const type = event.type ?? "";
  const eventType = EVENT_MAP[type];
  // Unmapped (e.g. email.sent — logged at send time) is acknowledged but ignored.
  if (!eventType) return NextResponse.json({ ok: true, ignored: type });

  const recipients = (
    Array.isArray(event.data?.to) ? event.data?.to : event.data?.to ? [event.data.to] : []
  )
    .map((e) => (typeof e === "string" ? e.toLowerCase().trim() : ""))
    .filter(Boolean);
  if (recipients.length === 0) return NextResponse.json({ ok: true, matched: 0 });

  const admin = createAdminClient();

  // Only ever touch addresses that are actually leads — never log member/admin mail.
  const { data: matchedLeads } = await admin
    .from("leads")
    .select("id, email, drip_status")
    .in("email", recipients);
  if (!matchedLeads || matchedLeads.length === 0) {
    return NextResponse.json({ ok: true, matched: 0 });
  }

  // 1) ENGAGEMENT LOG — one row per matched lead. The partial unique index dedups
  // Svix retries of the once-per-email events (delivered/bounced/complained); a
  // 23505 there is expected and swallowed. supabase-js reports it on `error`, not
  // by throwing, so we inspect the code rather than try/catch.
  const resendId = event.data?.email_id ?? null;
  const clickUrl =
    eventType === "clicked"
      ? (event.data?.click?.link ?? event.data?.click?.url ?? null)
      : null;
  for (const lead of matchedLeads) {
    const { error } = await admin.from("lead_email_events").insert({
      resend_id: resendId,
      email: lead.email as string,
      event_type: eventType,
      url: clickUrl,
    });
    if (error && error.code !== "23505") {
      console.error("lead_email_events insert failed:", error.message);
    }
  }

  // 2) SUPPRESSION — complaint / permanent bounce stops the drip. Never resurrect a
  // converted buyer's status.
  const suppressStatus =
    eventType === "complained"
      ? "unsubscribed"
      : eventType === "bounced" && event.data?.bounce?.type !== "Transient"
        ? "bounced"
        : null;
  let suppressed = 0;
  if (suppressStatus) {
    const patch: Record<string, unknown> = { drip_status: suppressStatus };
    if (suppressStatus === "unsubscribed") patch.unsubscribed_at = new Date().toISOString();
    const { data: updated } = await admin
      .from("leads")
      .update(patch)
      .in("email", recipients)
      .neq("drip_status", "converted")
      .select("id");
    suppressed = updated?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    event: type,
    logged: matchedLeads.length,
    suppressed,
  });
}
