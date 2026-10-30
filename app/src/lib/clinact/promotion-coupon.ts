import type { PlanOffer } from "./plans";

/**
 * The PagBank coupon behind a promotional offer — pure, so it can be tested
 * (lib/pagbank/subscriptions.ts is server-only).
 *
 * Same rule as the plans (subscribe.ts ensurePlanId): THE TERMS ARE PART OF
 * THE REFERENCE and are checked again after the lookup. If the promotional
 * price or the number of discounted charges ever changes, the old coupon can
 * no longer match and a new one is created — a changed offer can never charge
 * the old discount while the page shows the new one.
 */

export type CouponSpec = {
  reference_id: string;
  name: string;
  description: string;
  amount_off_cents: number;
  cycles: number;
};

export function couponSpec(offer: PlanOffer): CouponSpec | null {
  if (!offer.promotion || offer.discount_cents <= 0 || offer.promo_cycles < 1) return null;
  return {
    // e.g. clinact-black-friday-2026-anual-12000x1 (PagBank allows 65 chars)
    reference_id: `clinact-${offer.promotion.key}-${offer.planKey}-${offer.discount_cents}x${offer.promo_cycles}`.slice(0, 65),
    name: `ClinAct ${offer.promotion.key} ${offer.planKey}`.slice(0, 65),
    description: `${offer.promotion.label}: ${offer.discount_cents} centavos de desconto em ${offer.promo_cycles} cobrança(s)`.slice(0, 250),
    amount_off_cents: offer.discount_cents,
    cycles: offer.promo_cycles,
  };
}

/** Does a coupon PagBank returned carry exactly these terms? */
export function couponMatches(
  coupon: {
    reference_id?: string;
    status?: string;
    discount?: { type?: string; value?: number | string };
    duration?: { type?: string; occurrences?: number | string };
    exp_at?: string | null;
  },
  spec: CouponSpec,
): boolean {
  if (coupon.reference_id !== spec.reference_id) return false;
  if (coupon.status !== "ACTIVE") return false;
  if (coupon.discount?.type !== "AMOUNT" || Number(coupon.discount.value) !== spec.amount_off_cents) return false;
  // A coupon with an expiry is not ours (see createCoupon): refuse it.
  if (coupon.exp_at) return false;
  if (spec.cycles === 1) return coupon.duration?.type === "ONCE";
  return coupon.duration?.type === "REPEATING" && Number(coupon.duration.occurrences) === spec.cycles;
}
