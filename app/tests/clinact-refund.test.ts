/**
 * The "Reembolsar" button of a ClinAct invoice (Karina 2026-11-02): cancel the
 * subscription, refund the payment on PagBank, end access, record who + when —
 * behind a confirmation. lib/clinact/refund.ts is server-only, so its ORDER and
 * guards are checked on the source; the PagBank decisions are pure and tested
 * directly (shapes observed in sandbox on 2026-11-02).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PagBankSubscriptionsError,
  isAlreadyRefunded,
  isIdempotencyConflict,
  paymentToRefund,
} from "@/lib/pagbank/subscriptions-core";

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");
const REFUND = read("lib/clinact/refund.ts");
const ROUTE = read("app/api/admin/clinact/refund/route.ts");
const ISSUE = read("app/api/admin/nfse/issue/route.ts");
const CLIENT = read("app/admin/notas-fiscais/notas-fiscais-client.tsx");
const CLIENT_API = read("lib/pagbank/subscriptions.ts");

test("only the APPROVED payment holds money; REFUNDED means it is already back", () => {
  assert.deepEqual(
    paymentToRefund([
      { id: "PAYM_A", status: "DENIED" },
      { id: "PAYM_B", status: "APPROVED" },
    ]),
    { kind: "refund", id: "PAYM_B" },
  );
  assert.deepEqual(paymentToRefund([{ id: "PAYM_B", status: "REFUNDED" }]), { kind: "already", id: "PAYM_B" });
  assert.deepEqual(paymentToRefund([{ id: "PAYM_A", status: "DENIED" }]), { kind: "none" });
  assert.deepEqual(paymentToRefund([]), { kind: "none" });
});

test("PagBank's two 'already done' answers are recognised — and nothing else", () => {
  // Sandbox 2026-11-02, a new key on a refunded payment:
  const again = new PagBankSubscriptionsError(400, {
    error_messages: [{ error: "status_payment_refund_validation", description: "already been refund" }],
  });
  // …and the same key replayed:
  const replay = new PagBankSubscriptionsError(409, {
    error_messages: [{ error: "idempotency_key_validation", parameter_name: "x-idempotency-key" }],
  });
  const missingAmount = new PagBankSubscriptionsError(400, {
    error_messages: [{ error: "parameter_required_missing", parameter_name: "amount" }],
  });
  assert.equal(isAlreadyRefunded(again), true);
  assert.equal(isIdempotencyConflict(replay), true);
  assert.equal(isAlreadyRefunded(missingAmount), false);
  assert.equal(isIdempotencyConflict(missingAmount), false);
});

test("the refund always sends amount — PagBank rejects a full refund without it", () => {
  assert.match(CLIENT_API, /\/payments\/\$\{paymentId\}\/refunds`,\s*\{ amount: \{ value: amountCents, currency: "BRL" \} \}/);
});

test("order: claim → cancel → refund → access → record; cancel BEFORE any money moves", () => {
  const at = (s: string) => {
    const i = REFUND.indexOf(s);
    assert.ok(i > 0, s);
    return i;
  };
  const claim = at(".update({ refund_claimed_at: new Date().toISOString() })");
  const cancel = at("await cancelSubscription(subscriptionId, audit)");
  const refund = at("await refundPayment(");
  const access = at('.from("user_product_access")');
  const record = at("refunded_by: actorId");
  assert.ok(claim < cancel && cancel < refund && refund < access && access < record);
});

test("access ends only for the student's CURRENT subscription, and never moves forward", () => {
  assert.match(REFUND, /const isCurrent = current\?\.pagbank_subscription_id === subscriptionId/);
  assert.match(REFUND, /if \(isCurrent\) \{\s*const \{ data: revoked \}/);
  // Shortens only — an access already shorter than now is left alone.
  assert.match(REFUND, /\.gt\("paid_until", refundedAt\)/);
});

test("a failure releases the claim so the admin can try again", () => {
  const releases = REFUND.match(/await release\(\)/g) ?? [];
  assert.ok(releases.length >= 3, `only ${releases.length} release() calls`);
  assert.match(REFUND, /\.is\("refunded_at", null\)/);
});

test("billing tier only, invoice id validated", () => {
  assert.match(ROUTE, /\["super_admin", "billing_admin"\]/);
  assert.match(ROUTE, /\^INVO_/);
});

test("a refund the button made can never be 'unrefunded'; a manual mark records the admin", () => {
  assert.match(ISSUE, /case "unrefund":\s*\/\/[^\n]*\n\s*if \(row\.refund_id\)/);
  assert.match(ISSUE, /refunded_at: nowIso, refunded_by: user\.id/);
});

test("the screen asks for confirmation and shows when + who", () => {
  assert.match(CLIENT, /data-testid="clinact-refund-confirm"/);
  assert.match(CLIENT, /setConfirming\(true\)/);
  assert.match(CLIENT, /fetch\("\/api\/admin\/clinact\/refund"/);
  assert.match(CLIENT, /refundedOnBy/);
  assert.match(CLIENT, /\{!row\.refund\.byApp && \(/);
});

test("every refund string exists in both admin locales", () => {
  const pt = JSON.parse(read("locales/admin/pt-BR.json")).notasFiscais;
  const en = JSON.parse(read("locales/admin/en.json")).notasFiscais;
  const used = [...new Set([...CLIENT.matchAll(/t\("notasFiscais\.(refund\w*|markRefunded|unmarkRefunded)"/g)].map((m) => m[1]))];
  assert.ok(used.length >= 15, `found ${used.length}`);
  for (const k of used) {
    assert.ok(pt[k], `pt-BR missing ${k}`);
    assert.ok(en[k], `en missing ${k}`);
  }
});
