import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PagBankSubscriptionsError,
  isIdempotencyConflict,
  idempotencyKey,
  grantsAccess,
} from "@/lib/pagbank/subscriptions-core";

// Karina's condition before submitting the PagBank homologation (2026-09-17):
// prove the card's security code is never stored, never logged, never sent to
// monitoring, never written to the database, and lives only in memory for the
// one call that needs it.
//
// PagBank forces that one call: POST /subscriptions refuses every request shape
// without `security_code` in plain text, even when the card itself was
// encrypted in the browser. So the CVV crosses our server exactly once, and
// these tests are what keep it that way as the code grows.

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

const CLIENT = "lib/pagbank/subscriptions.ts";
const WEBHOOK_ROUTE = "app/api/pagbank/assinaturas/webhook/route.ts";
const WEBHOOK_AUTH = "lib/pagbank/subscriptions-webhook-auth.ts";

// ── The CVV never reaches a log, a monitor, or a database ───────────────────

test("the subscriptions client logs nothing at all", () => {
  const src = read(CLIENT);
  // Not "no CVV in the logs" — no logging whatsoever. A log line added later
  // near the request body is exactly how a CVV leaks.
  assert.equal(/console\.(log|error|warn|info|debug)/.test(src), false, "no console calls");
  assert.equal(/logger\./.test(src), false, "no logger calls");
});

test("the CVV is passed straight through and never held", () => {
  const src = read(CLIENT);
  // It appears only as a parameter and in the request body of createSubscription.
  const uses = [...src.matchAll(/security_code/g)];
  assert.ok(uses.length > 0, "the field exists — PagBank requires it");
  assert.equal(
    /security_code:\s*input\.security_code/.test(src),
    true,
    "handed to PagBank directly from the argument",
  );
  // Nothing may keep it: no module-level cache, no assignment to an outer name.
  assert.equal(/(const|let|var)\s+\w*(cvv|securityCode|security_code)\w*\s*=/i.test(src), false,
    "the CVV is never bound to a variable of its own");
});

test("an API error carries the response, never the request that held the CVV", () => {
  const err = new PagBankSubscriptionsError(400, { error_messages: [{ error: "x" }] });
  const serialised = JSON.stringify({ ...err, message: err.message, stack: "" });
  assert.equal(serialised.includes("security_code"), false);
  // Whatever the class carries, the request is not part of it.
  const fields = Object.keys(err).sort();
  assert.ok(fields.includes("status") && fields.includes("body"));
  for (const forbidden of ["request", "requestBody", "payload", "card"]) {
    assert.equal(fields.includes(forbidden), false, `must not carry ${forbidden}`);
  }
});

test("no monitoring or APM receives our payloads", () => {
  const pkg = JSON.parse(
    readFileSync(path.resolve(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const apm = deps.filter((d) =>
    /^(@sentry|dd-trace|datadog|newrelic|@newrelic|bugsnag|logrocket|posthog|@opentelemetry|@vercel\/otel)/.test(d),
  );
  assert.deepEqual(apm, [], `no APM/monitoring package may be installed; found: ${apm.join(", ")}`);

  // The one place server errors are handled sends message/stack/route only.
  const instrumentation = read("instrumentation.ts");
  // It may name a column "body"; what matters is that it never READS the
  // request's body — it only ever touches request?.method.
  assert.equal(/request(\?\.|\.)(json|text|arrayBuffer|body)/.test(instrumentation), false,
    "instrumentation must never read or forward a request body");
});

test("the webhook route stores no card data and no signature value", () => {
  const route = read(WEBHOOK_ROUTE);
  assert.equal(/security_code|encrypted/.test(route), false, "no card fields");
  // Header NAMES are recorded; values are not — one of them is the signature.
  assert.ok(/request\.headers\.keys\(\)/.test(route), "records header names");
  assert.equal(/headers\.entries\(\)|Object\.fromEntries\(request\.headers/.test(route), false,
    "never records header values wholesale");
});

test("only a bounded sample of the signature is kept", () => {
  const auth = read(WEBHOOK_AUTH);
  assert.ok(/value\.slice\(0,\s*8\)/.test(auth), "at most the first 8 characters");
});

// ── The guards around duplicate charges and access ──────────────────────────

test("an idempotency key is alphanumeric, as PagBank requires", () => {
  const key = idempotencyKey("clinact-sub", "user_42", "2026-09-17T00:00:00Z");
  assert.match(key, /^[a-zA-Z0-9]+$/, "no special characters");
  assert.ok(key.length <= 200);
});

test("a replayed key is recognised as 'already created', not as a failure", () => {
  const conflict = new PagBankSubscriptionsError(409, {
    error_messages: [{ error: "idempotency_key_validation", description: "The idempotence key is already in use." }],
  });
  assert.equal(isIdempotencyConflict(conflict), true);
  // A different 409 (a duplicate tax_id, say) must NOT be read that way.
  const otherConflict = new PagBankSubscriptionsError(409, {
    error_messages: [{ error: "invalid_parameter", description: "already a customer registered with the informed tax_ID" }],
  });
  assert.equal(isIdempotencyConflict(otherConflict), false);
  assert.equal(isIdempotencyConflict(new Error("network")), false);
});

test("access follows ACTIVE only — a created subscription is not a paid one", () => {
  assert.equal(grantsAccess("ACTIVE"), true);
  for (const status of ["OVERDUE", "PENDING_ACTION", "SUSPENDED", "CANCELED", "PENDING", "TRIAL"] as const) {
    assert.equal(grantsAccess(status), false, `${status} must not grant access`);
  }
});
