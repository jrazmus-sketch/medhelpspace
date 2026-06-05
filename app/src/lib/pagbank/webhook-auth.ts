import crypto from "node:crypto";
import { getAccessToken, getPagBankEnv } from "./api";

// PagBank webhook authenticity check.
// Header: x-authenticity-token
// Value: SHA-256 hex of `${token}-${raw_body}`, where `token` is your PagBank
// ACCOUNT token — the SAME credential used for API auth, NOT a separate
// "notification token". The new PagBank API has no dedicated webhook-token field
// to generate; the old "Configurações → Notificações → Token" menu is classic
// PagSeguro only. So we reuse the active environment's access token, and let
// PAGBANK_WEBHOOK_TOKEN override it only if your signing token ever differs.
// Ref: https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao
//
// NOTE: the raw body must be hashed unmodified (any reformatting changes the
// hash). PagBank's docs vary on the separator ("-" vs concat); if a real signed
// webhook logs "invalid" with a known-good token, flip FORMAT.

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
  const token = process.env.PAGBANK_WEBHOOK_TOKEN || getAccessToken(getPagBankEnv());
  if (!token) return "unconfigured";
  if (!headerValue) return "missing-header";

  const payload = FORMAT === "dash" ? `${token}-${rawBody}` : `${token}${rawBody}`;
  const expected = crypto.createHash("sha256").update(payload).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(headerValue.toLowerCase(), "utf8");
  if (a.length !== b.length) return "invalid";
  return crypto.timingSafeEqual(a, b) ? "valid" : "invalid";
}
