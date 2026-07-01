import { resolveMx, resolve4 } from "node:dns/promises";

// Anti-abuse + deliverability guard for the free-funnel lead form
// (FREE-FUNNEL-V2-SCOPE.md Group 1). Runs on the Node.js runtime (default here),
// so node:dns is available. The whole point: NEVER send an email to an address we
// haven't sanity-checked — a bot submitting third-party addresses would turn us
// into a spam cannon, tanking a young sending domain's reputation and killing the
// transactional purchase emails too.
//
// Layers (cheap → expensive; first failure wins):
//   1. honeypot      — a form field humans never fill
//   2. disposable    — static denylist of throwaway-inbox domains
//   3. rate-limit    — per-IP, best-effort in-memory (mirrors pagbank/rate-limit)
//   4. Turnstile     — Cloudflare invisible challenge, ONLY when configured
//   5. MX / A record — the domain must be able to receive mail
//
// This module is a plain server helper (no "use server"); it's imported by the
// capture/claim server actions in actions/magnet.ts.

export type AbuseVerdict = { ok: true } | { ok: false; reason: string };

// ── 1. Honeypot ─────────────────────────────────────────────────────────────

// The form renders a visually-hidden field (e.g. name="company"); a real user
// leaves it blank, most bots fill it. Any non-empty value = bot.
export function honeypotTripped(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ── 2. Disposable-domain denylist ───────────────────────────────────────────

// Common throwaway-inbox providers. Not exhaustive (an arms race), but it stops
// the bulk of low-effort abuse without a paid list. Lowercase, bare domains.
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com",
  "grr.la", "10minutemail.com", "10minutemail.net", "temp-mail.org", "tempmail.com",
  "tempmailo.com", "throwawaymail.com", "yopmail.com", "yopmail.net", "getnada.com",
  "nada.email", "dispostable.com", "trashmail.com", "trashmail.de", "maildrop.cc",
  "mailnesia.com", "mohmal.com", "fakeinbox.com", "spam4.me", "mytemp.email",
  "moakt.com", "emailondeck.com", "tempr.email", "discard.email", "mailcatch.com",
  "inboxkitten.com", "burnermail.io", "tempinbox.com", "spamgourmet.com", "mvrht.net",
  "einrot.com", "33mail.com", "guerrillamailblock.com", "pokemail.net", "temp-mail.io",
  "tmail.ws", "mail-temp.com", "1secmail.com", "1secmail.org", "1secmail.net",
]);

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  return DISPOSABLE_DOMAINS.has(emailDomain(email));
}

// ── 3. Per-IP rate limit (best-effort, in-memory) ────────────────────────────

// Separate, much tighter bucket than the pagbank webhook limiter: code sends are
// the spam-cannon surface, so cap them hard per IP. Best-effort only — the Map is
// per serverless instance (Vercel), like lib/pagbank/rate-limit.ts. The real walls
// are Turnstile + the per-email resend throttle (DB-backed, in actions/magnet.ts).
type Bucket = { count: number; resetAt: number };
const codeBuckets = new Map<string, Bucket>();
const RL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RL_MAX_PER_WINDOW = 8; // ≤8 code requests per IP per hour

export function checkCodeRateLimit(ip: string): boolean {
  const now = Date.now();
  const b = codeBuckets.get(ip);
  if (!b || b.resetAt < now) {
    codeBuckets.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS });
    for (const [k, v] of codeBuckets) if (v.resetAt < now) codeBuckets.delete(k);
    return true;
  }
  if (b.count >= RL_MAX_PER_WINDOW) return false;
  b.count += 1;
  return true;
}

// ── 4. Cloudflare Turnstile (optional) ───────────────────────────────────────

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

// Verify a Turnstile token server-side. When the secret is NOT configured we skip
// (return true) so the funnel works without Turnstile set up — the honeypot +
// rate-limit + MX layers still apply. When it IS configured, a missing/invalid
// token fails closed.
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → skip this layer
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (e) {
    // A verification-endpoint outage shouldn't hard-block real users; the other
    // layers still gate. Log and fail open.
    console.error("turnstile verify threw:", e);
    return true;
  }
}

// ── 5. MX / A-record check ───────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("dns_timeout")), ms)),
  ]);
}

// Only these two codes are a DEFINITIVE "this domain cannot receive mail":
//   ENOTFOUND = the domain doesn't exist (NXDOMAIN)
//   ENODATA   = the domain exists but has no record of that type
// Everything else (SERVFAIL/EAI_AGAIN/ETIMEOUT/our dns_timeout sentinel) is a
// transient resolver flake — on those we must FAIL OPEN so a real gmail/outlook
// user is never wrongly blocked (a truly dead address just bounces at Resend, and
// honeypot + rate-limit + Turnstile still gate bots).
function isDefinitiveDnsMiss(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NOTFOUND";
}

// True if the domain can plausibly receive mail: an MX record, or (RFC 5321
// fallback) an A record. Fails CLOSED only on a definitive NXDOMAIN/ENODATA on
// BOTH lookups; fails OPEN on any transient resolver error or timeout.
export async function domainCanReceiveMail(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const mx = await withTimeout(resolveMx(domain), 3000);
    if (mx && mx.length > 0) return true;
    // empty result → no MX; fall through to the A-record check
  } catch (e) {
    // Not a definitive miss (resolver flake / timeout) → don't block a real user.
    if (!isDefinitiveDnsMiss(e)) return true;
    // Definitive on MX → the A fallback below decides.
  }
  try {
    const a = await withTimeout(resolve4(domain), 3000);
    return Array.isArray(a) && a.length > 0;
  } catch (e) {
    if (!isDefinitiveDnsMiss(e)) return true; // fail open on flake/timeout
    return false; // definitive NXDOMAIN/ENODATA on both MX and A → cannot receive mail
  }
}

// ── Composite guard used before sending a code ───────────────────────────────

// Runs the full ladder for a code-send request. `email` must already be
// format-validated by the caller. Returns the first failing reason (stable
// machine strings — the UI maps them to friendly pt-BR copy).
export async function guardCodeRequest(opts: {
  email: string;
  ip: string;
  honeypot?: string | null;
  turnstileToken?: string | null;
}): Promise<AbuseVerdict> {
  if (honeypotTripped(opts.honeypot)) return { ok: false, reason: "honeypot" };
  if (isDisposableEmail(opts.email)) return { ok: false, reason: "disposable_email" };
  if (!checkCodeRateLimit(opts.ip)) return { ok: false, reason: "rate_limited" };
  if (!(await verifyTurnstile(opts.turnstileToken, opts.ip)))
    return { ok: false, reason: "turnstile_failed" };
  if (!(await domainCanReceiveMail(emailDomain(opts.email))))
    return { ok: false, reason: "undeliverable_domain" };
  return { ok: true };
}
