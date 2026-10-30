/**
 * ClinAct subscription plans — THE single source of truth for price.
 *
 * Karina's decision 2 (2026-09-01): the displayed value reads from the official
 * plan configuration, and only the commercial copy around the number is
 * editable. Her reason, on record: an editable price string that disagrees with
 * what PagBank charges is a CDC problem, not a bug. So the sales page, the
 * checkout and the subscription call all read from here — a price can never be
 * edited into disagreement with what is actually charged.
 *
 * Values in CENTS, like every other money field in this project.
 */

export const CLINACT_PLANS = {
  mensal: {
    key: "mensal",
    label: "Mensal",
    amount_cents: 2990,
    interval: "MONTH",
    interval_count: 1,
  },
  anual: {
    key: "anual",
    label: "Anual",
    amount_cents: 29900,
    interval: "YEAR",
    interval_count: 1,
  },
} as const;

export type ClinactPlanKey = keyof typeof CLINACT_PLANS;
export type ClinactPlan = (typeof CLINACT_PLANS)[ClinactPlanKey];

export const CLINACT_PLAN_LIST: ClinactPlan[] = [CLINACT_PLANS.mensal, CLINACT_PLANS.anual];

/** "R$ 29,90" — BRL, pt-BR, from cents. */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * The annual plan's effective monthly price. Computed, never typed: her copy
 * says "dez mensalidades, doze meses", and that claim has to stay true if a
 * price ever changes.
 */
export function annualPerMonth(): string {
  return formatBRL(Math.round(CLINACT_PLANS.anual.amount_cents / 12));
}

/** How many monthly payments the annual plan costs, e.g. 10. */
export function annualInMonthlies(): number {
  return Math.round(CLINACT_PLANS.anual.amount_cents / CLINACT_PLANS.mensal.amount_cents);
}

// ── Launch promotion ─────────────────────────────────────────────────────────

/**
 * "Condição de lançamento Black Friday" (Karina 2026-10-29). ClinAct goes on
 * sale WITH it: annual R$ 179 for the first year, monthly R$ 20,90 for the first
 * three charges, then the normal plan price. Subscribing inside the window
 * keeps the condition; after it, new subscribers pay the normal price.
 *
 * How it is charged: the subscription stays on the NORMAL plan (so every
 * renewal is the normal price, with nothing to switch later) and carries a
 * PagBank coupon worth the difference for `cycles` charges — ONCE for the
 * annual first year, REPEATING ×3 for the monthly. The coupon is attached by
 * the server only, inside the window; there is no code for the student to type.
 *
 * `starts_on`/`ends_on` are Brazilian calendar days, both INCLUSIVE, compared
 * with todayKeyBR() — never a UTC date (Vercel runs in UTC; after 21:00 BRT
 * the UTC date is already tomorrow).
 *
 * Her display rule, decided in writing: the normal price appears struck through
 * and smaller, the promotional price is the main one, and the renewal price is
 * always stated. Every number on screen comes from here.
 */
export type ClinactPromotion = {
  key: string;
  label: string;
  starts_on: string;
  ends_on: string;
  plans: Record<ClinactPlanKey, { amount_cents: number; cycles: number }>;
};

export const CLINACT_PROMOTIONS: ClinactPromotion[] = [
  {
    key: "black-friday-2026",
    label: "Condição de lançamento Black Friday",
    starts_on: "2026-11-02",
    ends_on: "2026-11-30",
    plans: {
      anual: { amount_cents: 17900, cycles: 1 },
      mensal: { amount_cents: 2090, cycles: 3 },
    },
  },
];

/** The promotion running on a Brazilian day (YYYY-MM-DD), if any. */
export function activePromotion(todayKey: string): ClinactPromotion | null {
  return CLINACT_PROMOTIONS.find((p) => p.starts_on <= todayKey && todayKey <= p.ends_on) ?? null;
}

/**
 * What a subscriber to `planKey` is charged, starting on `todayKey`. One shape
 * for every screen and for the charge itself, so they cannot disagree.
 */
export type PlanOffer = {
  planKey: ClinactPlanKey;
  /** The normal plan price — every charge after the promotional ones. */
  normal_cents: number;
  /** The first charge. Equals normal_cents when there is no promotion. */
  first_cents: number;
  /** How many charges are at first_cents (0 = no promotion). */
  promo_cycles: number;
  /** normal − promotional, per discounted charge (0 = no promotion). */
  discount_cents: number;
  promotion: ClinactPromotion | null;
};

export function planOffer(planKey: ClinactPlanKey, todayKey: string): PlanOffer {
  const plan = CLINACT_PLANS[planKey];
  const promotion = activePromotion(todayKey);
  const promo = promotion?.plans[planKey];
  if (!promotion || !promo || promo.amount_cents >= plan.amount_cents || promo.cycles < 1) {
    return { planKey, normal_cents: plan.amount_cents, first_cents: plan.amount_cents, promo_cycles: 0, discount_cents: 0, promotion: null };
  }
  return {
    planKey,
    normal_cents: plan.amount_cents,
    first_cents: promo.amount_cents,
    promo_cycles: promo.cycles,
    discount_cents: plan.amount_cents - promo.amount_cents,
    promotion,
  };
}

/** The offer a subscription was SOLD with, rebuilt from what its row stored. */
export function storedOffer(
  planKey: ClinactPlanKey,
  row: { promotion_key?: string | null; promo_amount_cents?: number | null; promo_cycles?: number | null },
): PlanOffer {
  const plan = CLINACT_PLANS[planKey];
  const promotion = CLINACT_PROMOTIONS.find((p) => p.key === row.promotion_key) ?? null;
  if (!promotion || !row.promo_amount_cents || !row.promo_cycles) {
    return { planKey, normal_cents: plan.amount_cents, first_cents: plan.amount_cents, promo_cycles: 0, discount_cents: 0, promotion: null };
  }
  return {
    planKey,
    normal_cents: plan.amount_cents,
    first_cents: row.promo_amount_cents,
    promo_cycles: row.promo_cycles,
    discount_cents: plan.amount_cents - row.promo_amount_cents,
    promotion,
  };
}

/** "/ano" or "/mês". */
export function perPeriod(planKey: ClinactPlanKey): string {
  return CLINACT_PLANS[planKey].interval === "YEAR" ? "/ano" : "/mês";
}

/**
 * The promotional price line of a plan card, in her words:
 *   annual  → "R$ 179,00 no primeiro ano"
 *   monthly → "R$ 20,90/mês nos 3 primeiros meses"
 * Empty without a promotion.
 */
export function promoPriceLine(offer: PlanOffer): string {
  if (!offer.promotion) return "";
  return `${formatBRL(offer.first_cents)}${promoPriceSuffix(offer)}`;
}

/**
 * What follows the promotional amount when it is set large on its own:
 * " no primeiro ano" / "/mês nos 3 primeiros meses" (leading space or slash
 * included, so amount + suffix reads as one phrase).
 */
export function promoPriceSuffix(offer: PlanOffer): string {
  if (!offer.promotion) return "";
  const yearly = CLINACT_PLANS[offer.planKey].interval === "YEAR";
  if (offer.promo_cycles === 1) return yearly ? " no primeiro ano" : " no primeiro mês";
  return `${perPeriod(offer.planKey)} nos ${offer.promo_cycles} primeiros ${yearly ? "anos" : "meses"}`;
}

/**
 * The line under the promotional price on a plan card, in her words:
 *   annual  → "Renovação automática por R$ 299,00/ano."
 *   monthly → "Depois, R$ 29,90/mês."
 * Without a promotion it states the automatic renewal.
 */
export function renewalLine(offer: PlanOffer): string {
  const normal = `${formatBRL(offer.normal_cents)}${perPeriod(offer.planKey)}`;
  if (offer.promotion && CLINACT_PLANS[offer.planKey].interval === "MONTH") return `Depois, ${normal}.`;
  return `Renovação automática por ${normal}.`;
}

/**
 * The charge schedule spelled out, for the checkout and the confirmation
 * e-mail (Karina: "no anual, deixar claro que a primeira cobrança é de R$179 e
 * a renovação seguinte é de R$299/ano; no mensal, que as três primeiras
 * cobranças são de R$20,90 e, a partir da quarta, passam para R$29,90/mês").
 */
export function chargeSchedule(offer: PlanOffer): string {
  const normal = `${formatBRL(offer.normal_cents)}${perPeriod(offer.planKey)}`;
  const yearly = CLINACT_PLANS[offer.planKey].interval === "YEAR";
  if (!offer.promotion) {
    return `Cobrança de ${formatBRL(offer.normal_cents)} hoje, renovada automaticamente por ${normal} até você cancelar.`;
  }
  if (offer.promo_cycles === 1) {
    return yearly
      ? `A primeira cobrança é de ${formatBRL(offer.first_cents)}. A renovação seguinte, um ano depois, é de ${normal}.`
      : `A primeira cobrança é de ${formatBRL(offer.first_cents)}. A partir da segunda, ${normal}.`;
  }
  return `As ${offer.promo_cycles} primeiras cobranças são de ${formatBRL(offer.first_cents)}. A partir da ${offer.promo_cycles + 1}ª, ${normal}.`;
}

/** The annual first charge as a monthly equivalent, e.g. "R$ 14,92". */
export function annualOfferPerMonth(offer: PlanOffer): string {
  return formatBRL(Math.round(offer.first_cents / 12));
}

/** How many NORMAL monthly payments the annual first charge equals, e.g. 6. */
export function annualOfferInMonthlies(offer: PlanOffer): number {
  return Math.round(offer.first_cents / CLINACT_PLANS.mensal.amount_cents);
}
