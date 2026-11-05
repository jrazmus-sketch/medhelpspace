import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOfferStrip } from "@/lib/home/offers";
import { CLINACT_PROMOTIONS, activePromotion } from "@/lib/clinact/plans";

// The home page's offer strip is computed, never typed: it shows only offers
// that are running, and says when each ends.

const BF_END = "2026-12-01T03:00:00.000Z"; // exclusive → last day 30/11 (BRT)
const turma = (pct: number | null, ends: string | null = BF_END) => ({
  isOnSale: pct != null,
  discountPercent: pct,
  saleBadgeLabel: pct != null ? "BLACK FRIDAY" : null,
  saleEndsAt: pct != null ? ends : null,
});

test("Black Friday on both products: one line, one shared end date", () => {
  const s = buildOfferStrip([turma(50), turma(50)], activePromotion("2026-11-15"));
  assert.ok(s);
  assert.equal(s.pill, "Black Friday");
  assert.deepEqual(s.parts.map((p) => p.text), ["Revalida com 50% OFF", "ClinAct em condição de lançamento"]);
  assert.deepEqual(s.parts.map((p) => p.href), ["/revalida#precos", "/clinact#planos"]);
  assert.equal(s.sharedUntil, "30/11");
});

test("different discounts read 'até N%'", () => {
  const s = buildOfferStrip([turma(50), turma(30)], null);
  assert.equal(s?.parts[0].text, "Revalida com até 50% OFF");
});

test("nothing running → no strip at all", () => {
  assert.equal(buildOfferStrip([turma(null), turma(null)], activePromotion("2026-12-01")), null);
});

test("ClinAct promo window follows CLINACT_PROMOTIONS (inclusive days)", () => {
  const bf = CLINACT_PROMOTIONS.find((p) => p.key === "black-friday-2026");
  assert.ok(bf);
  assert.ok(activePromotion(bf.ends_on));
  const s = buildOfferStrip([], activePromotion(bf.ends_on));
  assert.equal(s?.parts.length, 1);
  assert.equal(s?.sharedUntil, bf.ends_on.slice(8, 10) + "/" + bf.ends_on.slice(5, 7));
});

test("different end dates are stated per part", () => {
  const s = buildOfferStrip([turma(50, "2026-11-21T03:00:00.000Z")], activePromotion("2026-11-15"));
  assert.equal(s?.sharedUntil, null);
  assert.deepEqual(s?.parts.map((p) => p.until), ["20/11", "30/11"]);
});
