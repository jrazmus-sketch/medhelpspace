import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  reconcileOutcome,
  canRetryWithNewKey,
  isIdempotencyConflict,
  PagBankSubscriptionsError,
  type SubscriptionStatus,
} from "@/lib/pagbank/subscriptions-core";

// Karina's condition for production (2026-09-18):
//
//   "no cenário em que o POST de criação da assinatura é concluído pelo
//    PagBank, mas nossa aplicação sofre timeout antes de receber o HTTP 201,
//    uma repetição com a mesma x-idempotency-key retorna HTTP 409. Confirme
//    que a implementação do ClinAct tratará esse 409 como possível operação já
//    concluída e fará a reconciliação da assinatura existente, em vez de
//    apresentá-lo simplesmente como falha de pagamento ou permitir que uma
//    nova chave gere outra assinatura."
//
// The money is real on the other side of this: a new key creates a SECOND
// subscription and charges again — two paid R$ 299,00 invoices in sandbox.

const SUB = (status: SubscriptionStatus) => ({ id: "SUBS_1", status });

test("a lost 201 that really did go through: paid, so grant access", () => {
  // The subscription still reads OVERDUE for a few minutes after the charge
  // clears, so the INVOICE is what decides.
  const outcome = reconcileOutcome(SUB("OVERDUE"), [{ status: "PAID" }]);
  assert.deepEqual(outcome, { kind: "paid", subscriptionId: "SUBS_1" });
  assert.equal(canRetryWithNewKey(outcome), false, "charging again would double-charge");
});

test("an ACTIVE subscription with a paid invoice is also paid", () => {
  assert.deepEqual(reconcileOutcome(SUB("ACTIVE"), [{ status: "PAID" }]),
    { kind: "paid", subscriptionId: "SUBS_1" });
});

test("it exists but nothing is paid: pending, never 'payment failed'", () => {
  for (const status of ["OVERDUE", "PENDING", "PENDING_ACTION", "SUSPENDED"] as const) {
    const outcome = reconcileOutcome(SUB(status), [{ status: "OVERDUE" }]);
    assert.deepEqual(outcome, { kind: "pending", subscriptionId: "SUBS_1", status });
    assert.equal(canRetryWithNewKey(outcome), false, `${status} must not be charged again`);
  }
});

test("an invoice that is merely waiting is not access", () => {
  const outcome = reconcileOutcome(SUB("ACTIVE"), [{ status: "WAITING" }]);
  assert.equal(outcome.kind, "pending");
});

test("one paid invoice among several is enough", () => {
  const outcome = reconcileOutcome(SUB("ACTIVE"), [
    { status: "CANCELED" }, { status: "OVERDUE" }, { status: "PAID" },
  ]);
  assert.equal(outcome.kind, "paid");
});

test("nothing was created: only then may a new key be used", () => {
  const outcome = reconcileOutcome(null, []);
  assert.deepEqual(outcome, { kind: "absent" });
  assert.equal(canRetryWithNewKey(outcome), true);
});

test("a subscription with no invoices at all is pending, not absent", () => {
  // "Absent" is the ONLY state that permits a fresh charge, so nothing that
  // exists may ever collapse into it.
  const outcome = reconcileOutcome(SUB("PENDING"), []);
  assert.equal(outcome.kind, "pending");
  assert.equal(canRetryWithNewKey(outcome), false);
});

test("the 409 that starts all this is told apart from other conflicts", () => {
  const idem = new PagBankSubscriptionsError(409, {
    error_messages: [{ error: "idempotency_key_validation", description: "The idempotence key is already in use." }],
  });
  assert.equal(isIdempotencyConflict(idem), true);
  const taxId = new PagBankSubscriptionsError(409, {
    error_messages: [{ error: "invalid_parameter", description: "already a customer registered with the informed tax_ID" }],
  });
  assert.equal(isIdempotencyConflict(taxId), false);
});

// ── The client must offer the lookup, and must not paper over the conflict ──

test("recovery looks the subscription up by our own reference_id", () => {
  const src = readFileSync(
    path.join(path.resolve(import.meta.dirname, "..", "src"), "lib/pagbank/subscriptions.ts"),
    "utf8",
  );
  assert.ok(/reconcileByReference/.test(src), "the recovery path exists");
  assert.ok(/query\.set\("reference_id"/.test(src), "it filters by our reference");
  assert.ok(/listInvoices\(subscription\.id\)/.test(src), "and reads the invoices before deciding");
  // No automatic re-issue: nothing in the client may generate a fresh key on a
  // failed create. That decision belongs to the caller, via canRetryWithNewKey.
  assert.equal(/catch[\s\S]{0,200}idempotencyKey\(/.test(src), false,
    "the client must never silently retry a create with a new key");
});
