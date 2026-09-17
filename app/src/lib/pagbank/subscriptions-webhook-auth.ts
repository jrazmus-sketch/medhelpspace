import "server-only";
import crypto from "node:crypto";
import { getSubscriptionsEnv } from "./subscriptions";

/**
 * Authenticity check for Pagamentos Recorrentes webhooks.
 *
 * WHAT A REAL DELIVERY SHOWED (sandbox, 2026-09-17). These webhooks carry
 * **`x-payload-signature`**, and its value is a ~96-character base64 blob
 * starting `MEUC…` / `MEQC…` — the DER prefix of an **ECDSA** signature. It is
 * NOT the Orders mechanism:
 *
 *   Orders (Revalida)   x-authenticity-token   SHA-256 hex of `{token}-{body}`
 *   Subscriptions       x-payload-signature    ECDSA (DER, base64), key unknown
 *
 * PagBank's "Confirmar autenticidade da notificação" reference documents ONLY
 * the Orders mechanism, and their subscription webhook reference documents no
 * verification at all. Verifying an ECDSA signature needs PagBank's public key,
 * which is not published and is not served by any endpoint on the assinaturas
 * host (/public-keys there returns the RSA key used to ENCRYPT CARDS, a
 * different key for a different purpose — it cannot verify this). So today we
 * can identify the signature but not check it. Asked of PagBank as part of
 * homologation.
 *
 * That is safe ONLY because the route grants nothing: it re-reads the
 * subscription from the authenticated API and never trusts the body — the same
 * reasoning the Orders route already documents, where the re-fetch, not the
 * signature, is the real gate. Before any webhook is allowed to move
 * `user_product_access`, either PagBank gives us the key and this fails closed,
 * or access keeps following an API read that a forged body cannot influence.
 */

export type SubscriptionWebhookAuthResult =
  | "valid"
  | "invalid"
  /** An ECDSA signature we have no key for — identified, not verified. */
  | "unsupported-format"
  | "missing-header"
  | "unconfigured";

export type SubscriptionWebhookAuthCheck = {
  result: SubscriptionWebhookAuthResult;
  /** Which hash shape matched, when one did. */
  format: "dash" | "concat" | null;
  /** Which header carried the signature, so a change on PagBank's side is visible. */
  header: string | null;
  /** Non-secret shape hint: "len=96 der-ecdsa MEUCICp0…" — never the whole value. */
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

/** A DER SEQUENCE holding two INTEGERs, base64'd, always starts MEU/MEQ/MEY. */
function looksLikeDerSignature(value: string): boolean {
  return /^ME[UQY][A-Za-z0-9+/=]+$/.test(value);
}

function describe(value: string): string {
  const shape = looksLikeDerSignature(value)
    ? "der-ecdsa"
    : /^[0-9a-f]+$/i.test(value)
      ? "hex"
      : /^[A-Za-z0-9+/=]+$/.test(value)
        ? "base64"
        : "other";
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

  // An ECDSA signature cannot be checked with a shared token. Say so, rather
  // than comparing hashes that can never match and calling it "invalid" — that
  // would read as "someone forged this" in every log line.
  if (looksLikeDerSignature(signature.value)) {
    return { result: "unsupported-format", format: null, header: signature.header, sample };
  }

  const token = signingToken();
  if (!token) return { result: "unconfigured", format: null, header: signature.header, sample };

  // The Orders shape, kept for the fallback header: the raw body must be hashed
  // exactly as received — any reformatting changes the hash.
  for (const format of ["dash", "concat"] as const) {
    const payload = format === "dash" ? `${token}-${rawBody}` : `${token}${rawBody}`;
    const expected = crypto.createHash("sha256").update(payload).digest("hex");
    if (matches(expected, signature.value)) {
      return { result: "valid", format, header: signature.header, sample };
    }
  }
  return { result: "invalid", format: null, header: signature.header, sample };
}
