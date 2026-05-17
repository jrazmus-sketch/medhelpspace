/**
 * Cohort pricing — single source of truth.
 * Imported by both the checkout page (UI labels) and the charge API route (amounts).
 * Prices are a business decision, not a DB concern.
 */

export type CohortProduct = {
  slug: string;
  name: string;
  priceLabel: string;   // Display string, e.g. "R$ 3.990"
  amountCents: number;  // In centavos, e.g. 399000
};

export const COHORT_PRODUCTS: Record<string, CohortProduct> = {
  "revalida-2026-2": {
    slug: "revalida-2026-2",
    name: "Revalida 2026.2",
    priceLabel: "R$ 3.990",
    amountCents: 399000,
  },
  "revalida-2027-1": {
    slug: "revalida-2027-1",
    name: "Revalida 2027.1",
    priceLabel: "R$ 4.990",
    amountCents: 499000,
  },
};
