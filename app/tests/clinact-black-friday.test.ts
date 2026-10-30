import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activePromotion,
  annualOfferInMonthlies,
  annualOfferPerMonth,
  chargeSchedule,
  planOffer,
  promoPriceLine,
  promoPriceSuffix,
  renewalLine,
  storedOffer,
} from "@/lib/clinact/plans";
import { couponMatches, couponSpec } from "@/lib/clinact/promotion-coupon";
import { EMAIL_TEMPLATE_DEFAULTS } from "@/lib/email-render";

// Karina 2026-10-29 — "Condição de lançamento Black Friday", the final
// definition of the campaign: 02/11 → 30/11/2026; annual R$ 179 in the first
// year then R$ 299/ano; monthly R$ 20,90 for the first 3 charges then
// R$ 29,90/mês; normal price struck through; renewal always stated.

const nb = (s: string) => s.replace(/ /g, " "); // pt-BR currency uses a no-break space
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("the window is 02/11 → 30/11/2026, both days included, in Brazilian dates", () => {
  assert.equal(activePromotion("2026-11-01"), null);
  assert.equal(activePromotion("2026-11-02")?.key, "black-friday-2026");
  assert.equal(activePromotion("2026-11-30")?.key, "black-friday-2026");
  assert.equal(activePromotion("2026-12-01"), null);
});

test("inside the window: annual R$ 179 once, monthly R$ 20,90 three times", () => {
  const anual = planOffer("anual", "2026-11-15");
  assert.deepEqual(
    { first: anual.first_cents, normal: anual.normal_cents, cycles: anual.promo_cycles, off: anual.discount_cents },
    { first: 17900, normal: 29900, cycles: 1, off: 12000 },
  );
  const mensal = planOffer("mensal", "2026-11-15");
  assert.deepEqual(
    { first: mensal.first_cents, normal: mensal.normal_cents, cycles: mensal.promo_cycles, off: mensal.discount_cents },
    { first: 2090, normal: 2990, cycles: 3, off: 900 },
  );
});

test("outside the window every new subscriber pays the normal price", () => {
  for (const day of ["2026-10-29", "2026-12-01", "2027-03-01"]) {
    assert.equal(planOffer("anual", day).first_cents, 29900);
    assert.equal(planOffer("mensal", day).first_cents, 2990);
    assert.equal(planOffer("mensal", day).promotion, null);
  }
});

test("the card lines read as she wrote them", () => {
  const anual = planOffer("anual", "2026-11-02");
  const mensal = planOffer("mensal", "2026-11-02");
  assert.equal(anual.promotion?.label, "Condição de lançamento Black Friday");
  assert.equal(nb(promoPriceLine(anual)), "R$ 179,00 no primeiro ano");
  assert.equal(nb(renewalLine(anual)), "Renovação automática por R$ 299,00/ano.");
  assert.equal(nb(promoPriceLine(mensal)), "R$ 20,90/mês nos 3 primeiros meses");
  assert.equal(nb(renewalLine(mensal)), "Depois, R$ 29,90/mês.");
  assert.equal(promoPriceSuffix(anual), " no primeiro ano");
  assert.equal(promoPriceSuffix(mensal), "/mês nos 3 primeiros meses");
});

test("the charge schedule says first charge vs renewal (annual) and 3 charges vs the 4th (monthly)", () => {
  assert.equal(
    nb(chargeSchedule(planOffer("anual", "2026-11-02"))),
    "A primeira cobrança é de R$ 179,00. A renovação seguinte, um ano depois, é de R$ 299,00/ano.",
  );
  assert.equal(
    nb(chargeSchedule(planOffer("mensal", "2026-11-02"))),
    "As 3 primeiras cobranças são de R$ 20,90. A partir da 4ª, R$ 29,90/mês.",
  );
  assert.match(nb(chargeSchedule(planOffer("anual", "2026-12-01"))), /^Cobrança de R\$ 299,00 hoje, renovada automaticamente por R\$ 299,00\/ano/);
});

test("the annual equivalents follow the first-year price", () => {
  const anual = planOffer("anual", "2026-11-02");
  assert.equal(nb(annualOfferPerMonth(anual)), "R$ 14,92");
  assert.equal(annualOfferInMonthlies(anual), 6);
  const normal = planOffer("anual", "2026-12-01");
  assert.equal(nb(annualOfferPerMonth(normal)), "R$ 24,92");
  assert.equal(annualOfferInMonthlies(normal), 10);
});

test("a subscription keeps the condition it was SOLD at, whatever the date", () => {
  const sold = storedOffer("mensal", { promotion_key: "black-friday-2026", promo_amount_cents: 2090, promo_cycles: 3 });
  assert.equal(sold.first_cents, 2090);
  assert.equal(sold.promo_cycles, 3);
  assert.equal(storedOffer("mensal", { promotion_key: null }).first_cents, 2990);
  assert.equal(storedOffer("mensal", { promotion_key: "unknown", promo_amount_cents: 1, promo_cycles: 1 }).promotion, null);
});

test("the coupon carries the discount, not the price, and its terms are in the reference", () => {
  const anual = couponSpec(planOffer("anual", "2026-11-02"))!;
  const mensal = couponSpec(planOffer("mensal", "2026-11-02"))!;
  assert.equal(anual.reference_id, "clinact-black-friday-2026-anual-12000x1");
  assert.equal(anual.amount_off_cents, 12000);
  assert.equal(anual.cycles, 1);
  assert.equal(mensal.reference_id, "clinact-black-friday-2026-mensal-900x3");
  assert.equal(mensal.cycles, 3);
  assert.ok(anual.reference_id.length <= 65 && anual.name.length <= 65);
  assert.equal(couponSpec(planOffer("anual", "2026-12-01")), null);
});

test("a coupon is reused only when PagBank's copy has exactly these terms", () => {
  const spec = couponSpec(planOffer("mensal", "2026-11-02"))!;
  const good = {
    reference_id: spec.reference_id,
    status: "ACTIVE",
    discount: { type: "AMOUNT", value: "900" }, // PagBank answers the value as a string
    duration: { type: "REPEATING", occurrences: 3 },
    exp_at: null,
  };
  assert.ok(couponMatches(good, spec));
  assert.ok(!couponMatches({ ...good, status: "INACTIVE" }, spec));
  assert.ok(!couponMatches({ ...good, discount: { type: "PERCENT", value: 900 } }, spec));
  assert.ok(!couponMatches({ ...good, duration: { type: "REPEATING", occurrences: 6 } }, spec));
  assert.ok(!couponMatches({ ...good, duration: { type: "REPEATING" } }, spec), "a list row without occurrences is re-read, not trusted");
  assert.ok(!couponMatches({ ...good, exp_at: "2026-11-30" }, spec), "an expiring coupon is not ours");
  const once = couponSpec(planOffer("anual", "2026-11-02"))!;
  assert.ok(couponMatches({ ...good, reference_id: once.reference_id, discount: { type: "AMOUNT", value: 12000 }, duration: { type: "ONCE" } }, once));
});

test("the server decides the price, attaches the coupon, and refuses a price the page did not show", () => {
  const src = read("src/lib/clinact/subscribe.ts");
  const flow = src.slice(src.indexOf("export async function subscribeToClinact"));
  assert.match(flow, /planOffer\(input\.planKey, todayKeyBR\(\)\)/);
  assert.ok(
    flow.indexOf("expectedFirstCents !== offer.first_cents") < flow.indexOf("ensurePlanId("),
    "the price check runs before anything reaches PagBank",
  );
  assert.match(flow, /if \(offer\.promotion\) couponId = await ensureCouponId\(offer, audit\)/);
  assert.match(flow, /coupon_id: couponId \?\? undefined/);
  const form = read("src/app/clinact/(membro)/assinar/subscribe-form.tsx");
  assert.match(form, /expectedFirstCents: selected\?\.firstCents/);
});

test("the sales page strikes the normal price and states the renewal under the promotion", () => {
  const sections = read("src/components/clinact/sales/sections.tsx");
  const planos = sections.slice(sections.indexOf("function Planos("));
  assert.match(planos, /<s className="[^"]*">\{formatBRL\(offer\.normal_cents\)\}<\/s>/);
  assert.match(planos, /\{offer\.promotion\.label\}/);
  assert.match(planos, /\{renewalLine\(offer\)\}/);
  assert.match(planos, /planOffer\(plan\.key, todayKeyBR\(\)\)/);
});

test("the e-mails never type a price: every amount and date is a variable", () => {
  for (const kind of ["clinact-subscription-confirmed", "clinact-renewal-notice"]) {
    const t = EMAIL_TEMPLATE_DEFAULTS[kind];
    assert.ok(t, kind);
    for (const field of [t.subject, t.headline, t.body_html]) assert.doesNotMatch(field, /R\$|\d{2}\/\d{2}/, kind);
  }
  assert.match(EMAIL_TEMPLATE_DEFAULTS["clinact-renewal-notice"].body_html, /\{\{renewalAmount\}\}/);
  assert.match(EMAIL_TEMPLATE_DEFAULTS["clinact-subscription-confirmed"].body_html, /\{\{chargeSchedule\}\}/);
});

test("the patch marks existing subscriptions as confirmed, so no old subscriber gets a confirmation", () => {
  const patch = readFileSync(join(process.cwd(), "..", "schema-patch-clinact-black-friday.sql"), "utf8");
  assert.match(patch, /SET confirmation_sent_for = pagbank_subscription_id/);
  assert.match(patch, /ON CONFLICT \(kind\) DO NOTHING/);
});
