/**
 * The two ship-blockers found by the 2026-09-22 pre-launch audit.
 *
 * 1. A buyer could be charged, shown "pagamento aprovado", and get no access:
 *    finalizePaidOrder's result was discarded and the route answered with
 *    PagBank's own `status: "PAID"`. Access lives in user_cohort_memberships,
 *    so that is what the checkout must be told about — `buyerHasAccess`.
 * 2. The funnel's step-2 actions mailed a branded access link to any address
 *    handed to them, with none of the guards their step-1 siblings carry —
 *    an open relay on the domain that also sends Pix receipts. `guardMagnetSend`
 *    closes it without demanding a Turnstile token those steps cannot produce.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buyerHasAccess } from "@/lib/pagbank/finalize";
import {
  guardMagnetSend,
  guardCodeRequest,
  checkCodeRateLimit,
} from "@/lib/magnet/anti-abuse";

const SRC = join(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

// ── 1. "Paid" means the membership exists ────────────────────────────────────

/** Minimal stand-in for the Supabase admin client's chained reads. */
function fakeAdmin(result: { data?: unknown; error?: unknown }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: result.data ?? null, error: result.error ?? null }),
  };
  return { from: () => chain };
}

test("buyerHasAccess is true only when a membership row exists", async () => {
  assert.equal(await buyerHasAccess(fakeAdmin({ data: { user_id: "u1" } }), "u1", 7), true);
  assert.equal(await buyerHasAccess(fakeAdmin({ data: null }), "u1", 7), false);
});

test("buyerHasAccess claims nothing when the read fails", async () => {
  // A failed read must not read as "granted" — the buyer would be shown success
  // over a charge that provisioned nothing.
  assert.equal(
    await buyerHasAccess(fakeAdmin({ error: { message: "boom" } }), "u1", 7),
    false,
  );
});

test("the charge route reports access, not PagBank's status, to the checkout", () => {
  const route = read("app/api/pagbank/charge/route.ts");
  assert.match(route, /buyerHasAccess\(admin, user\.id, product\.id\)/);
  assert.match(route, /granted,/);
});

test("the Pix poll only reports paid once access is live", () => {
  const route = read("app/api/pagbank/status/[chargeId]/route.ts");
  assert.match(route, /buyerHasAccess\(admin, user\.id, order\.cohort_id as number\)/);
  assert.match(route, /paid: granted/);
});

test("the checkout success screen requires granted, not just PAID", () => {
  const client = read("app/checkout/checkout-client.tsx");
  assert.match(client, /chargeResult\.status === "PAID" && chargeResult\.granted/);
  // And the charged-but-not-granted case tells the buyer the truth instead.
  assert.match(client, /liberação do acesso ainda está sendo concluída/);
});

// ── 2. Step 2 of the funnels is not an open relay ────────────────────────────

test("guardMagnetSend blocks a honeypot hit before anything is sent", async () => {
  const v = await guardMagnetSend({ email: "a@example.com", ip: "1.2.3.4", honeypot: "bot" });
  assert.deepEqual(v, { ok: false, reason: "honeypot" });
});

test("guardMagnetSend blocks disposable inboxes", async () => {
  const v = await guardMagnetSend({ email: "x@mailinator.com", ip: "1.2.3.5" });
  assert.deepEqual(v, { ok: false, reason: "disposable_email" });
});

test("one IP hammering the send step is rate-limited", () => {
  // Exercised directly: inside the guard the disposable check short-circuits
  // first, and anything that gets past the limiter would do a real DNS lookup,
  // which a test must not depend on.
  const ip = "9.9.9.9";
  let allowed = 0;
  while (checkCodeRateLimit(ip) && allowed < 500) allowed++;
  assert.ok(allowed > 0, "the first attempts from a fresh IP must pass");
  assert.ok(allowed < 500, "an IP must eventually be blocked");
  assert.equal(checkCodeRateLimit(ip), false);
  // A different IP is unaffected by that burst.
  assert.equal(checkCodeRateLimit("9.9.9.10"), true);
});

test("guardMagnetSend applies the limiter before the expensive checks", () => {
  const src = readFileSync(join(SRC, "lib/magnet/anti-abuse.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function guardMagnetSend"));
  const limiter = body.indexOf("checkCodeRateLimit");
  const dns = body.indexOf("domainCanReceiveMail");
  assert.ok(limiter > 0 && dns > limiter, "rate limit must run before the MX lookup");
});

test("guardMagnetSend does not fail closed on a missing Turnstile token", async () => {
  // These steps render no widget. If a missing token were fatal (as it is in
  // guardCodeRequest, correctly), setting the Turnstile keys would silently kill
  // the funnel. The token is only checked when the caller actually supplies one.
  const src = readFileSync(join(SRC, "lib/magnet/anti-abuse.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function guardMagnetSend"));
  assert.match(body, /opts\.turnstileToken && !\(await verifyTurnstile\(/);
  // The code-request guard keeps its unconditional check.
  const codeBody = src.slice(
    src.indexOf("export async function guardCodeRequest"),
    src.indexOf("export async function guardMagnetSend"),
  );
  assert.match(codeBody, /if \(!\(await verifyTurnstile\(opts\.turnstileToken, opts\.ip\)\)\)/);
  assert.equal(typeof guardCodeRequest, "function");
});

test("both step-2 senders run the guard before mailing a link", () => {
  const actions = read("actions/magnet.ts");
  for (const fn of ["chooseFlashcardsCohortAndSend", "chooseSimuladoCohortAndSend"]) {
    const start = actions.indexOf(`export async function ${fn}`);
    assert.ok(start > 0, `${fn} not found`);
    const body = actions.slice(start, start + 2000);
    const guardAt = body.indexOf("guardMagnetSend");
    const sendAt = body.indexOf("sendTemplateEmail");
    assert.ok(guardAt > 0, `${fn} must call guardMagnetSend`);
    if (sendAt > 0) assert.ok(guardAt < sendAt, `${fn} must guard before sending`);
  }
});
