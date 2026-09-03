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
