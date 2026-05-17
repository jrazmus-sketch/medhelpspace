import crypto from "node:crypto";

// PagBank Connect notification authenticity check.
// Header: x-authenticity-token
// Value: SHA-256 hex of `${notification_token}-${raw_body}`
// The notification_token is configured in the PagBank dashboard
// (Configurações → Notificações → Token) and copied here as
// PAGBANK_WEBHOOK_TOKEN.
//
// NOTE: PagBank's docs across the classic PagSeguro / Connect APIs describe
// slightly different separators ("-" vs concat). If verification fails in
// production once the token is configured, try TOKEN_BODY_FORMAT = "concat".

export type WebhookAuthResult =
  | "valid"
  | "invalid"
  | "missing-header"
  | "unconfigured";

const FORMAT: "dash" | "concat" = "dash";

export function verifyPagBankSignature(
  rawBody: string,
  headerValue: string | null,
): WebhookAuthResult {
  const token = process.env.PAGBANK_WEBHOOK_TOKEN;
  if (!token) return "unconfigured";
  if (!headerValue) return "missing-header";

  const payload = FORMAT === "dash" ? `${token}-${rawBody}` : `${token}${rawBody}`;
  const expected = crypto.createHash("sha256").update(payload).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(headerValue.toLowerCase(), "utf8");
  if (a.length !== b.length) return "invalid";
  return crypto.timingSafeEqual(a, b) ? "valid" : "invalid";
}
