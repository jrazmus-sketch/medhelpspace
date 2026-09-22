/**
 * Launch condition ("condição especial de lançamento", Karina 2026-09-21) — the
 * pure rules in lib/cohort-promotions-shared.ts, plus a source guard.
 *
 * The DB side (coupon refusal inside preview_coupon/redeem_coupon, the rollover
 * move) is exercised against a real Postgres when the patch is applied — see
 * schema-patch-cohort-promotions.sql.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  isPromotionOpen,
  lastDayKeyBR,
  formatDateKeyBR,
  pausedCouponCohorts,
  offeredCoupon,
  templateMentionsCoupon,
  type ActivePromotion,
} from "@/lib/cohort-promotions-shared";
import { WELCOME_COUPONS, RECOVERY_COUPONS, UNDECIDED_COHORT } from "@/lib/magnet/links";

// Karina's window as it stands (extended 2026-09-22 to Sunday 11/10):
// 22/09 00:00 BRT → 12/10 00:00 BRT (exclusive).
const WINDOW = { startsAt: "2026-09-22T03:00:00+00:00", endsAt: "2026-10-12T03:00:00+00:00" };

const PROMO: ActivePromotion = {
  id: 1,
  slug: "lancamento-2027-1-garantia-2027-2",
  cohortId: 2,
  cohortSlug: "revalida-2027-1",
  cohortName: "Revalida 2027.1",
  rolloverToCohortId: 4,
  rolloverToCohortSlug: "revalida-20272",
  rolloverToCohortName: "Revalida 2027.2",
  ...WINDOW,
  blocksCoupons: true,
  lastDayLabel: "11/10/2026",
};

test("window is [start, end) — opens at 00:00 BRT on 22/09, closes at 00:00 BRT on 12/10", () => {
  const at = (iso: string) => Date.parse(iso);
  assert.equal(isPromotionOpen(WINDOW, at("2026-09-21T23:59:59-03:00")), false);
  assert.equal(isPromotionOpen(WINDOW, at("2026-09-22T00:00:00-03:00")), true);
  // Last evening in Brazil — already "tomorrow" on a UTC server.
  assert.equal(isPromotionOpen(WINDOW, at("2026-10-11T23:59:59-03:00")), true);
  assert.equal(isPromotionOpen(WINDOW, at("2026-10-12T00:00:00-03:00")), false);
  assert.equal(isPromotionOpen({ startsAt: "nope", endsAt: WINDOW.endsAt }, Date.now()), false);
});

test("the banner's last valid day is the day BEFORE the exclusive end, in Brasília", () => {
  assert.equal(lastDayKeyBR(WINDOW.endsAt), "2026-10-11");
  assert.equal(formatDateKeyBR(lastDayKeyBR(WINDOW.endsAt)), "11/10/2026");
  // Postgres hands timestamptz back in several shapes — all must agree.
  assert.equal(lastDayKeyBR("2026-10-12 03:00:00+00"), "2026-10-11");
  assert.equal(lastDayKeyBR("2026-10-12T03:00:00Z"), "2026-10-11");
  assert.equal(formatDateKeyBR("garbage"), "");
  assert.equal(lastDayKeyBR("garbage"), "");
});

test("coupon offers pause on the promo turma AND the undecided track, never on 2027.2", () => {
  const paused = pausedCouponCohorts([PROMO]);
  assert.ok(paused.has("revalida-2027-1"));
  // FLASH5 (undecided) would be refused on 2027.1 — the turma most of them pick.
  assert.ok(paused.has(UNDECIDED_COHORT));
  assert.equal(paused.has("revalida-20272"), false);

  assert.equal(offeredCoupon(WELCOME_COUPONS, "revalida-2027-1", paused), null);
  assert.equal(offeredCoupon(WELCOME_COUPONS, UNDECIDED_COHORT, paused), null);
  assert.equal(offeredCoupon(RECOVERY_COUPONS, "revalida-2027-1", paused), null);
  assert.deepEqual(offeredCoupon(WELCOME_COUPONS, "revalida-20272", paused), WELCOME_COUPONS["revalida-20272"]);
  assert.deepEqual(offeredCoupon(RECOVERY_COUPONS, "revalida-20272", paused), RECOVERY_COUPONS["revalida-20272"]);
});

test("the crons' 'unknown turma → 2027.1 code' fallback is paused too", () => {
  const paused = pausedCouponCohorts([PROMO]);
  assert.equal(offeredCoupon(WELCOME_COUPONS, "revalida-2099-9", paused, "revalida-2027-1"), null);
  const none = pausedCouponCohorts([]);
  assert.deepEqual(
    offeredCoupon(WELCOME_COUPONS, "revalida-2099-9", none, "revalida-2027-1"),
    WELCOME_COUPONS["revalida-2027-1"],
  );
  assert.equal(offeredCoupon(WELCOME_COUPONS, "revalida-2099-9", none), null);
});

test("a non-blocking promotion pauses nothing; no promotion pauses nothing", () => {
  assert.equal(pausedCouponCohorts([{ ...PROMO, blocksCoupons: false }]).size, 0);
  assert.equal(pausedCouponCohorts([]).size, 0);
  assert.deepEqual(
    offeredCoupon(WELCOME_COUPONS, "revalida-2027-1", pausedCouponCohorts([])),
    WELCOME_COUPONS["revalida-2027-1"],
  );
});

test("templateMentionsCoupon reads every rendered field, and only real {{coupon…}} tokens", () => {
  assert.equal(templateMentionsCoupon({ body_html: "<p>use o cupom <strong>{{coupon}}</strong></p>" }), true);
  assert.equal(templateMentionsCoupon({ subject: "Separei {{couponPercent}} pra você" }), true);
  assert.equal(templateMentionsCoupon({ cta_label: "Usar meu cupom de {{ couponPercent }} →" }), true);
  assert.equal(templateMentionsCoupon({ headline: "x", kicker: "{{coupon}}" }), true);
  // The word "cupom" in plain copy is not the variable.
  assert.equal(templateMentionsCoupon({ body_html: "<p>Sem cupom hoje. {{checkoutUrl}}</p>" }), false);
  assert.equal(templateMentionsCoupon(null), false);
  assert.equal(templateMentionsCoupon(undefined), false);
});

// Guard: every place that OFFERS a coupon must go through offeredCoupon (or take
// the pause as a prop). A raw WELCOME_COUPONS[x] / RECOVERY_COUPONS[x] lookup is how
// a code the checkout refuses would slip back into an email or a reward page.
test("no raw coupon-table lookups outside the allowed places", () => {
  const root = join(import.meta.dirname, "..", "src");
  const allowed = new Set([
    "lib/magnet/links.ts",                  // the tables themselves
    "components/magnet/magnet-reward.tsx",  // client: gated by its couponPaused prop
  ]);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) {
        const rel = relative(root, full).replace(/\\/g, "/");
        if (allowed.has(rel)) continue;
        if (/(WELCOME|RECOVERY)_COUPONS\[/.test(readFileSync(full, "utf8"))) offenders.push(rel);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
  const reward = readFileSync(join(root, "components/magnet/magnet-reward.tsx"), "utf8");
  assert.match(reward, /couponPaused \? null : \(WELCOME_COUPONS\[cohort\]/);
});
