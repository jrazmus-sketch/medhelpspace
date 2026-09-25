import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FINALIZABLE_STATUSES,
  isFinalizable,
  isSyntheticCouponCharge,
  livePixBlocksCardMessage,
} from "@/lib/pagbank/order-rules";

const SRC = path.join(process.cwd(), "src");
// Line endings normalised: git may check files out with CRLF on Windows.
const read = (p: string) => readFileSync(path.join(SRC, p), "utf8").split("\r\n").join("\n");

// ── Refunded orders stay refunded ────────────────────────────────────────────

test("a PAID settlement can finalize pending, cancelled and declined orders — never refunded", () => {
  assert.equal(isFinalizable("pending"), true);
  // A Pix order we cancelled locally can still be settled at PagBank: honour it.
  assert.equal(isFinalizable("cancelled"), true);
  assert.equal(isFinalizable("declined"), true);
  assert.equal(isFinalizable("refunded"), false);
  assert.equal(isFinalizable("paid"), false);
  assert.equal(isFinalizable(null), false);
});

test("finalize flips status only from the finalizable set, never with `!= paid`", () => {
  const src = read("lib/pagbank/finalize.ts");
  assert.ok(!src.includes('.neq("status", "paid")'), "`!= paid` also matches 'refunded'");
  assert.ok(src.includes("isFinalizable(orderRow.status"), "must check the loaded status before granting");
  // The status check has to come BEFORE the membership upsert (the grant runs first).
  assert.ok(src.indexOf("isFinalizable(orderRow.status") < src.indexOf('.from("user_cohort_memberships")\n    .upsert'));
  assert.ok(FINALIZABLE_STATUSES.every((s) => s !== "refunded"));
});

test("the webhook never relabels a refunded order", () => {
  const src = read("app/api/pagbank/webhook/route.ts");
  assert.ok(src.includes('.not("status", "in", "(paid,refunded)")'));
});

// ── Double payment across methods ────────────────────────────────────────────

test("card is refused while a payable Pix QR exists, and Pix while a card is in flight", () => {
  const src = read("app/api/pagbank/charge/route.ts");
  assert.ok(src.includes("livePixBlocksCardMessage("), "card branch must refuse a live Pix");
  assert.match(src, /\.eq\("payment_method", "pix"\)[\s\S]{0,120}\.gt\("pix_expires_at"/);
  assert.match(src, /\.eq\("payment_method", "credit_card"\)[\s\S]{0,120}\.gte\("created_at", cardFreshSince\)/);
});

test("the refusal tells the buyer when the Pix expires, in Brasília time", () => {
  const msg = livePixBlocksCardMessage("2026-09-25T15:40:00.000Z");
  assert.match(msg, /12:40/); // 15:40 UTC = 12:40 BRT
  assert.match(msg, /pagar duas vezes/);
});

test("a second paid order for the same turma is recorded, flagged, and grants nothing new", () => {
  const src = read("lib/pagbank/finalize.ts");
  const dup = src.indexOf("stage: \"duplicate_payment\"");
  assert.ok(dup > 0, "an admin must be told to refund it");
  // The duplicate branch returns before the membership upsert and the purchase e-mail.
  assert.ok(dup < src.indexOf('.from("user_cohort_memberships")\n    .upsert'));
  assert.ok(dup < src.indexOf("sendPurchaseConfirmation("));
});

// ── Refunds ──────────────────────────────────────────────────────────────────

test("100%-coupon orders are recognised without PagBank", () => {
  assert.equal(isSyntheticCouponCharge("COUPON_12_abc", 0), true);
  assert.equal(isSyntheticCouponCharge(null, 0), true);
  assert.equal(isSyntheticCouponCharge("CHAR_ABC", 299700), false);
  assert.equal(isSyntheticCouponCharge(null, 299700), false);
});

test("a refund claims the order before PagBank and releases it if PagBank refuses", () => {
  const src = read("app/api/admin/billing/refund/route.ts");
  const claim = src.indexOf("refund_claimed_at: new Date()");
  const call = src.indexOf("/charges/${chargeId}/cancel");
  assert.ok(claim > 0 && call > 0 && claim < call, "claim must precede the PagBank call");
  assert.match(src, /\.eq\("status", "paid"\)\s*\.or\(`refund_claimed_at\.is\.null/);
  // Every PagBank failure path releases the claim so a retry is possible.
  const failures = src.slice(call).split("releaseClaim()").length - 1;
  assert.ok(failures >= 2, "network error and PagBank refusal must both release");
  assert.ok(src.includes("if (!couponOnly)"), "coupon orders skip PagBank");
});

test("refunding a duplicate never removes the access another paid order bought", () => {
  for (const f of ["app/api/admin/billing/refund/route.ts", "app/api/pagbank/webhook/route.ts"]) {
    const src = read(f);
    const other = src.indexOf('.neq("id", ');
    const revoke = src.indexOf('.from("user_cohort_memberships")\n');
    assert.ok(other > 0, `${f}: must look for another paid order`);
    assert.ok(src.lastIndexOf("stillPaid", revoke) > 0, `${f}: revoke must depend on it`);
  }
});

// ── Lost webhooks ────────────────────────────────────────────────────────────

test("a PagBank outage is retried, a 4xx is not", async () => {
  const { isTransientPagBankError } = await import("@/lib/pagbank/order-rules");
  assert.equal(isTransientPagBankError(new Error("PagBank API 503: down")), true);
  assert.equal(isTransientPagBankError(new Error("PagBank API 429: slow down")), true);
  assert.equal(isTransientPagBankError(new Error("fetch failed")), true);
  assert.equal(isTransientPagBankError(new Error("PagBank API 404: not found")), false);
});

test("a failed webhook re-read is recorded and asks PagBank to retry", () => {
  const src = read("app/api/pagbank/webhook/route.ts");
  const fail = src.indexOf("Webhook: failed to fetch charge/order");
  const tail = src.slice(fail, fail + 1800);
  assert.ok(tail.includes("recordAppError("));
  assert.match(tail, /isTransientPagBankError\(err\)\)\s*\{\s*return NextResponse\.json\(\{ ok: false \}, \{ status: 503 \}\)/);
});

test("the reconcile cron also recovers card charges, including locally-cancelled ones", () => {
  const src = read("app/api/cron/reconcile-pix/route.ts");
  assert.ok(src.includes('.eq("payment_method", "credit_card")'));
  assert.ok(src.includes('.in("status", ["pending", "cancelled"])'));
  assert.ok(src.includes("await getCharge(chargeId)"));
  // Only still-pending orders are closed; a cancelled one is never relabelled.
  assert.ok(src.includes('order.status === "pending" && (charge.status === "DECLINED"'));
});
