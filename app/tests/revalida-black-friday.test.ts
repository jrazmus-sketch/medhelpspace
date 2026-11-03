import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activeSalePriceCents,
  couponNotCombinableMessage,
  discountPercentOf,
  saleWindowFromDays,
  saleWindowLabel,
  saleWindowToDays,
} from "@/lib/cohort-sale";
import { pausedCouponCohorts } from "@/lib/cohort-promotions-shared";
import { REVALIDA_2027_1_SLUG, REVALIDA_20272_SLUG, UNDECIDED_COHORT } from "@/lib/magnet/links";

// Karina 2026-11-02 — Black Friday on the Revalida turmas: 50% from 02/11 00:00 to 30/11 23:59
// (Brasília), back to normal on its own on 01/12. Justin: coupons don't stack unless the coupon
// is marked combinable (a per-coupon switch, enforced in redeem_coupon).

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

const BF = {
  price_cents: 299700,
  sale_price_cents: 149850,
  sale_price_starts_at: "2026-11-02T03:00:00Z",
  sale_price_ends_at: "2026-12-01T03:00:00Z",
};
const at = (iso: string) => Date.parse(iso);

test("the promotional price holds from 02/11 00:00 BRT through 30/11 23:59:59 BRT, and not a second more", () => {
  assert.equal(activeSalePriceCents(BF, at("2026-11-02T02:59:59Z")), null, "01/11 23:59 BRT — not yet");
  assert.equal(activeSalePriceCents(BF, at("2026-11-02T03:00:00Z")), 149850, "02/11 00:00 BRT — on");
  assert.equal(activeSalePriceCents(BF, at("2026-12-01T02:59:59Z")), 149850, "30/11 23:59:59 BRT — still on");
  assert.equal(activeSalePriceCents(BF, at("2026-12-01T03:00:00Z")), null, "01/12 00:00 BRT — off by itself");
});

test("open bounds and invalid prices", () => {
  // a sale set before the window existed keeps working (manual on/off)
  assert.equal(activeSalePriceCents({ price_cents: 299700, sale_price_cents: 249700 }), 249700);
  assert.equal(activeSalePriceCents({ price_cents: 299700, sale_price_cents: null }), null);
  assert.equal(activeSalePriceCents({ price_cents: 299700, sale_price_cents: 299700 }), null, "not below the base");
  assert.equal(activeSalePriceCents({ price_cents: 299700, sale_price_cents: -1 }), null);
  assert.equal(activeSalePriceCents({ ...BF, sale_price_ends_at: "garbage" }, at("2026-11-10T12:00:00Z")), null);
});

test("her prices are exactly 50%", () => {
  assert.equal(discountPercentOf(299700, 149850), 50);
  assert.equal(discountPercentOf(399700, 199850), 50);
});

test("admin days ⇄ stored window (Brasília midnights, end exclusive)", () => {
  assert.deepEqual(saleWindowFromDays("2026-11-02", "2026-11-30"), {
    sale_price_starts_at: "2026-11-02T03:00:00.000Z",
    sale_price_ends_at: "2026-12-01T03:00:00.000Z",
  });
  assert.deepEqual(saleWindowToDays(BF.sale_price_starts_at, BF.sale_price_ends_at), {
    sale_first_day: "2026-11-02",
    sale_last_day: "2026-11-30",
  });
  assert.deepEqual(saleWindowFromDays("", ""), { sale_price_starts_at: null, sale_price_ends_at: null });
  assert.equal(saleWindowLabel(BF.sale_price_starts_at, BF.sale_price_ends_at), "02/11/2026 – 30/11/2026");
  assert.equal(saleWindowLabel(null, null), "");
});

test("the data patch stores the same window the admin form would", () => {
  const sql = readFileSync(path.join(root, "schema-patch-revalida-black-friday-2026.sql"), "utf8");
  const w = saleWindowFromDays("2026-11-02", "2026-11-30");
  assert.ok(sql.includes(`'${w.sale_price_starts_at!.replace(".000Z", "Z")}'`));
  assert.ok(sql.includes(`'${w.sale_price_ends_at!.replace(".000Z", "Z")}'`));
  assert.match(sql, /sale_price_cents\s+= 149850/);
  assert.match(sql, /sale_price_cents\s+= 199850/);
});

test("the DB refuses a non-combinable coupon inside BOTH coupon functions", () => {
  const sql = readFileSync(path.join(root, "schema-patch-cohort-sale-window.sql"), "utf8");
  const guards = sql.match(/IF NOT v_coupon\.combinable_with_offers\s+AND \(cohort_sale_price_active\(p_cohort_slug\)\s+OR \(v_list_cents IS NOT NULL AND p_base_amount_cents < v_list_cents\)\)\s+THEN RAISE EXCEPTION 'COUPON_NOT_COMBINABLE'/g) ?? [];
  assert.equal(guards.length, 2, "preview_coupon AND redeem_coupon — clock OR a base below the list price");
  assert.match(sql, /combinable_with_offers boolean NOT NULL DEFAULT false/, "every coupon starts non-combinable");
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.cohort_sale_price_active\(text\) FROM PUBLIC, anon, authenticated/);
});

test("the message names the campaign", () => {
  assert.equal(
    couponNotCombinableMessage("BLACK FRIDAY"),
    "Este cupom não pode ser combinado com a oferta BLACK FRIDAY desta turma.",
  );
  assert.match(couponNotCombinableMessage(null), /a oferta em vigor/);
});

test("coupon offers (drips, reward pages) pause per coupon while a turma is on sale", () => {
  const onSale = new Set([REVALIDA_2027_1_SLUG, REVALIDA_20272_SLUG]);
  // nothing combinable → both turmas and the undecided track (FLASH5) pause
  let paused = pausedCouponCohorts([], { saleCohorts: onSale, combinableCodes: new Set() });
  assert.deepEqual([...paused].sort(), [REVALIDA_20272_SLUG, REVALIDA_2027_1_SLUG, UNDECIDED_COHORT].sort());
  // she marks BEMVINDO10 combinable → the turmas' offers come back; FLASH5 still pauses
  paused = pausedCouponCohorts([], { saleCohorts: onSale, combinableCodes: new Set(["BEMVINDO10"]) });
  assert.deepEqual([...paused], [UNDECIDED_COHORT]);
  // …and FLASH5 too → nothing paused
  paused = pausedCouponCohorts([], { saleCohorts: onSale, combinableCodes: new Set(["BEMVINDO10", "FLASH5"]) });
  assert.equal(paused.size, 0);
  // no sale → no pause, whatever the coupons say
  assert.equal(pausedCouponCohorts([], { saleCohorts: new Set(), combinableCodes: new Set() }).size, 0);
});

test("checkout sends the price it showed, and the charge refuses a mismatch before redeeming anything", () => {
  const client = readFileSync(path.join(here, "..", "src", "app", "checkout", "checkout-client.tsx"), "utf8");
  assert.match(client, /expectedPriceCents: amountCents/);
  const route = readFileSync(path.join(here, "..", "src", "app", "api", "pagbank", "charge", "route.ts"), "utf8");
  const guard = route.indexOf("body.expectedPriceCents !== product.priceCents");
  const redeem = route.indexOf('admin.rpc("redeem_coupon"');
  assert.ok(guard > 0 && redeem > 0 && guard < redeem, "price check runs before the coupon is redeemed");
});

test("the storefront cache is dropped right after every Brasília midnight", () => {
  const vercel = JSON.parse(readFileSync(path.join(here, "..", "vercel.json"), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  const cron = vercel.crons.find((c) => c.path === "/api/cron/storefront-refresh");
  assert.equal(cron?.schedule, "1 3 * * *", "03:01 UTC = 00:01 BRT");
});
