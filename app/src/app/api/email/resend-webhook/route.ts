import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend webhook → feeds real deliverability signals back into `leads.drip_status`
// so both the verified drip (lead-drip) and the pre-verify recovery cron
// (lead-recovery) automatically stop emailing dead/hostile addresses. Before this,
// the "Bounced" status in /admin/leads was never written by anything.
//
//   email.bounced (Permanent) → drip_status='bounced'      (dead mailbox)
//   email.complained          → drip_status='unsubscribed' (marked us as spam —
//                               the strongest possible stop-emailing signal)
//
// Transient/soft bounces are IGNORED (Resend retries them; suppressing on a full
// mailbox would wrongly kill a recoverable address).
//
// Security: Resend signs webhooks with Svix. We verify the signature manually
// (no svix dep) over the RAW body and FAIL-CLOSED — an unconfigured secret or a
// bad signature is rejected, mirroring the project's webhook hardening. Configure
// the endpoint at Resend → Webhooks and put its signing secret in
// RESEND_WEBHOOK_SECRET (format: "whsec_<base64>").

export const dynamic = "force-dynamic";

const TOLERANCE_MS = 5 * 60 * 1000; // reject stale/replayed deliveries (±5 min)

type ResendEvent = {
  type?: string;
  data?: {
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
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
  const nextStatus =
    type === "email.complained"
      ? "unsubscribed"
      : type === "email.bounced" && event.data?.bounce?.type !== "Transient"
        ? "bounced"
        : null;

  // Any other event (delivered/opened/…) is acknowledged but ignored.
  if (!nextStatus) return NextResponse.json({ ok: true, ignored: type });

  const recipients = (
    Array.isArray(event.data?.to) ? event.data?.to : event.data?.to ? [event.data.to] : []
  )
    .map((e) => (typeof e === "string" ? e.toLowerCase().trim() : ""))
    .filter(Boolean);
  if (recipients.length === 0) return NextResponse.json({ ok: true, matched: 0 });

  const admin = createAdminClient();
  const patch: Record<string, unknown> = { drip_status: nextStatus };
  if (nextStatus === "unsubscribed") patch.unsubscribed_at = new Date().toISOString();

  // Only ever suppress; never resurrect a converted buyer's status.
  const { data: updated } = await admin
    .from("leads")
    .update(patch)
    .in("email", recipients)
    .neq("drip_status", "converted")
    .select("id");

  return NextResponse.json({ ok: true, event: type, matched: updated?.length ?? 0 });
}
