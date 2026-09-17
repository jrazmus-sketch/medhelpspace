import "server-only";
import crypto from "node:crypto";
import { getSubscriptionsEnv } from "./subscriptions";

/**
 * Authenticity check for Pagamentos Recorrentes webhooks.
 *
 * PagBank's subscription webhook reference documents the events and an example
 * payload and says NOTHING about how a receiver verifies a call. We found the
 * answer by registering our endpoint and reading what actually arrived
 * (2026-09-17): these webhooks carry **`x-payload-signature`** — NOT the
 * `x-authenticity-token` the Orders API sends (see webhook-auth.ts). Anyone
 * reusing the Orders verification here silently rejects every genuine event.
 *
 * The signature's ALGORITHM is still unconfirmed, so this function reports what
 * it finds rather than gating: it tries the two SHA-256 shapes PagBank's Orders
 * docs use, and the route records the result along with the signature's length
 * and prefix so the real format can be identified from a genuine delivery
 * (64 hex chars = SHA-256; a long base64 value = an asymmetric signature, which
 * would need PagBank's public key instead of our token).
 *
 * That reporting-only stance is safe ONLY because the route grants nothing: it
 * re-reads the subscription from the authenticated API and never trusts the
 * body. Before any webhook is allowed to move `user_product_access`, this must
 * fail closed, the way the Orders webhook already does.
 */

export type SubscriptionWebhookAuthResult =
  | "valid"
  | "invalid"
  | "missing-header"
  | "unconfigured";

export type SubscriptionWebhookAuthCheck = {
  result: SubscriptionWebhookAuthResult;
  /** Which hash shape matched, when one did — this is how we learn the format. */
  format: "dash" | "concat" | null;
  /** Which header carried the signature, so a change in PagBank's side is visible. */
  header: string | null;
  /** Non-secret shape hint: "len=64 hex 3f9a…" — never the whole value. */
  sample: string | null;
};

/** The header these webhooks actually use, then the Orders one as a fallback. */
export const SIGNATURE_HEADERS = ["x-payload-signature", "x-authenticity-token"] as const;

function signingToken(): string {
  const env = getSubscriptionsEnv();
  return (
    process.env.PAGBANK_SUBSCRIPTIONS_WEBHOOK_TOKEN ||
    (env === "production"
      ? process.env.PAGBANK_SUBSCRIPTIONS_TOKEN
      : process.env.PAGBANK_SUBSCRIPTIONS_TOKEN_SANDBOX) ||
    ""
  );
}

function describe(value: string): string {
  const shape = /^[0-9a-f]+$/i.test(value) ? "hex" : /^[A-Za-z0-9+/=]+$/.test(value) ? "base64" : "other";
  return `len=${value.length} ${shape} ${value.slice(0, 8)}…`;
}

function matches(expectedHex: string, headerValue: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(headerValue.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Reads the signature from whichever header carries it. */
export function readSignatureHeader(headers: Headers): { header: string; value: string } | null {
  for (const header of SIGNATURE_HEADERS) {
    const value = headers.get(header);
    if (value) return { header, value };
  }
  return null;
}

export function verifySubscriptionsWebhookSignature(
  rawBody: string,
  signature: { header: string; value: string } | null,
): SubscriptionWebhookAuthCheck {
  if (!signature) return { result: "missing-header", format: null, header: null, sample: null };

  const sample = describe(signature.value);
  const token = signingToken();
  if (!token) return { result: "unconfigured", format: null, header: signature.header, sample };

  // The raw body must be hashed exactly as received — any reformatting changes
  // the hash.
  for (const format of ["dash", "concat"] as const) {
    const payload = format === "dash" ? `${token}-${rawBody}` : `${token}${rawBody}`;
    const expected = crypto.createHash("sha256").update(payload).digest("hex");
    if (matches(expected, signature.value)) {
      return { result: "valid", format, header: signature.header, sample };
    }
  }
  return { result: "invalid", format: null, header: signature.header, sample };
}
