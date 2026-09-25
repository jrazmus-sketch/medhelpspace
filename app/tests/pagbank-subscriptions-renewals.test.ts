import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renewalDecision } from "@/lib/pagbank/subscriptions-core";

// Renewals: PagBank charges month two by itself, and nothing reliable tells us.
// Access is extended by reading the subscription and its invoices back and
// deciding with renewalDecision. Getting this wrong either hands out free
// months or locks out someone who paid.

const PAID = (occurrence: number) => ({ status: "PAID", occurrence });
const OVERDUE = (occurrence: number) => ({ status: "OVERDUE", occurrence });

test("a paid renewal extends access to PagBank's own next charge date", () => {
  const d = renewalDecision({ status: "ACTIVE", next_invoice_at: "2026-11-24" }, [PAID(1), PAID(2)]);
  assert.equal(d.action, "extend");
  // Noon in Brasília, so the date survives any timezone that reads it.
  assert.equal(d.action === "extend" && d.until, "2026-11-24T15:00:00.000Z");
});

test("only the LATEST invoice counts — an old payment is not this month's", () => {
  // Month one paid, month two declined: extending on month one would give a
  // free period to someone whose renewal failed.
  const d = renewalDecision({ status: "OVERDUE", next_invoice_at: "2026-11-24" }, [PAID(1), OVERDUE(2)]);
  assert.deepEqual(d, { action: "hold", reason: "unpaid" });
});

test("invoice order in the response does not matter", () => {
  const d = renewalDecision({ status: "ACTIVE", next_invoice_at: "2026-12-24" }, [PAID(3), OVERDUE(2), PAID(1)]);
  assert.equal(d.action, "extend", "occurrence 3 is the latest and it is paid");
});

test("a cancelled or expired subscription is never extended", () => {
  for (const status of ["CANCELED", "EXPIRED"]) {
    const d = renewalDecision({ status, next_invoice_at: "2026-11-24" }, [PAID(1)]);
    assert.deepEqual(d, { action: "hold", reason: "ended" }, `${status} must not gain a period`);
  }
});

test("no invoices, or no next charge date, holds rather than guessing", () => {
  assert.deepEqual(renewalDecision({ status: "ACTIVE", next_invoice_at: "2026-11-24" }, []),
    { action: "hold", reason: "unpaid" });
  assert.deepEqual(renewalDecision({ status: "ACTIVE", next_invoice_at: null }, [PAID(1)]),
    { action: "hold", reason: "no-next-invoice" });
  assert.deepEqual(renewalDecision({ status: "ACTIVE", next_invoice_at: "not-a-date" }, [PAID(1)]),
    { action: "hold", reason: "no-next-invoice" });
});

// ── The wiring that makes renewals actually happen ──────────────────────────

const SRC = path.resolve(import.meta.dirname, "..", "src");
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8");

test("the daily cron is scheduled and authenticated like every other cron", () => {
  const vercel = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "..", "vercel.json"), "utf8")) as {
    crons?: { path: string }[];
  };
  assert.ok(vercel.crons?.some((c) => c.path === "/api/cron/clinact-subscriptions"), "scheduled in vercel.json");
  const route = read("app/api/cron/clinact-subscriptions/route.ts");
  assert.ok(/timingSafeEqual/.test(route), "CRON_SECRET compared in constant time");
  assert.ok(/alertCronFailure/.test(route), "a crash reaches the admins");
});

test("renewals never trust a webhook body — they read PagBank back", () => {
  const renewals = read("lib/clinact/renewals.ts");
  assert.ok(/getSubscription\(/.test(renewals) && /listInvoices\(/.test(renewals), "authenticated reads");
  assert.ok(/renewalDecision\(/.test(renewals), "decided by the tested rule");
  assert.ok(/\.eq\("environment"/.test(renewals), "never crosses sandbox and production");
});
