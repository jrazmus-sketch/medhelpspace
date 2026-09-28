// A short-lived, signed reference to a lead row, handed to the browser right after
// the e-mail step so the OPTIONAL follow-up step (WhatsApp) can write to the same
// row without the client ever holding the lead id — and without letting anyone who
// merely knows an e-mail address attach a phone number to it.
//
// Format: `${leadId}.${funnel}.${expiresAtSeconds}.${hmac}`; HMAC-SHA256 keyed by
// the service-role key (server-only material that already exists in every
// environment). Two-hour TTL: long enough to answer the questions in between,
// short enough that a leaked ref is worthless by the next day.

import crypto from "node:crypto";

const TTL_SECONDS = 2 * 60 * 60;

function key(): string {
  // Prod names the service key SUPABASE_SERVICE_ROLE_KEY; the local stack names it
  // SUPABASE_SECRET_KEY (app/.env.development.local). Either is server-only.
  const k =
    process.env.LEAD_REF_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.CRON_SECRET;
  if (!k) throw new Error("lead-ref: no signing secret in the environment");
  return k;
}

function mac(payload: string): string {
  return crypto.createHmac("sha256", key()).update(payload).digest("base64url");
}

export function signLeadRef(leadId: string, funnel: string, now: Date = new Date()): string {
  const exp = Math.floor(now.getTime() / 1000) + TTL_SECONDS;
  const payload = `${leadId}.${funnel}.${exp}`;
  return `${payload}.${mac(payload)}`;
}

export function verifyLeadRef(
  ref: string | null | undefined,
  now: Date = new Date(),
): { leadId: string; funnel: string } | null {
  if (typeof ref !== "string") return null;
  const parts = ref.split(".");
  if (parts.length !== 4) return null;
  const [leadId, funnel, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!leadId || !funnel || !Number.isFinite(exp)) return null;
  if (exp * 1000 < now.getTime()) return null;
  const expected = mac(`${leadId}.${funnel}.${exp}`);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { leadId, funnel };
}
