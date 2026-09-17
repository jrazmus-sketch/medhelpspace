import "server-only";
import crypto from "node:crypto";
import { getSubscriptionsEnv } from "./subscriptions";

/**
 * Authenticity check for Pagamentos Recorrentes webhooks.
 *
 * THE HONEST STATE OF THIS (2026-09-17): PagBank's reference for subscription
 * webhooks documents the events and an example payload, and says NOTHING about
 * how the receiver verifies that a call is genuine — no signature header, no
 * token, no algorithm. Their Orders webhooks use `x-authenticity-token`, the
 * SHA-256 of `${token}-${rawBody}` (see webhook-auth.ts), so that is what we
 * test for here, against the SUBSCRIPTIONS credential rather than the Orders
 * one, trying both separator shapes PagBank's docs have used.
 *
 * Until a real delivery proves the format, this function's job is to REPORT,
 * not to gate: the route records what it found. That is only safe because the
 * route grants nothing — it re-reads the subscription from the authenticated
 * API and never trusts the body. Before any webhook is allowed to move
 * `user_product_access`, this must be made to fail closed, the way the Orders
 * webhook already does.
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
};

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

function matches(expectedHex: string, headerValue: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(headerValue.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function verifySubscriptionsWebhookSignature(
  rawBody: string,
  headerValue: string | null,
): SubscriptionWebhookAuthCheck {
  const token = signingToken();
  if (!token) return { result: "unconfigured", format: null };
  if (!headerValue) return { result: "missing-header", format: null };

  // The raw body must be hashed exactly as received — any reformatting changes
  // the hash.
  for (const format of ["dash", "concat"] as const) {
    const payload = format === "dash" ? `${token}-${rawBody}` : `${token}${rawBody}`;
    const expected = crypto.createHash("sha256").update(payload).digest("hex");
    if (matches(expected, headerValue)) return { result: "valid", format };
  }
  return { result: "invalid", format: null };
}
