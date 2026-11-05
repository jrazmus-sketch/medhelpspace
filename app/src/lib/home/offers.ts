// The offer strip on the MedHelpSpace home page (Karina 2026-11-05).
//
// Nothing here is typed by hand: the Revalida part comes from the turmas' sale
// window (cohorts.sale_price_* → CohortProduct.isOnSale, lib/cohort-sale.ts) and
// the ClinAct part from CLINACT_PROMOTIONS (lib/clinact/plans.ts). Each part
// appears only while its offer runs, so the strip ends on its own — the same
// "Black Friday ends with no one touching anything" rule as both sales pages.
//
// Pure (no server imports) so the page and the tests share it.

import { saleWindowToDays } from "@/lib/cohort-sale";
import type { ClinactPromotion } from "@/lib/clinact/plans";

export type RevalidaSaleInput = {
  isOnSale: boolean;
  discountPercent: number | null;
  saleBadgeLabel: string | null;
  saleEndsAt: string | null;
};

export type OfferPart = {
  product: "revalida" | "clinact";
  text: string;
  href: string;
  /** Last day of the offer, "DD/MM", or null when open-ended. */
  until: string | null;
};

export type OfferStrip = {
  /** Short pill label, e.g. "Black Friday". */
  pill: string;
  parts: OfferPart[];
  /** Set when every part ends the same day — then the strip says it once. */
  sharedUntil: string | null;
};

const ddmm = (key: string) => (key ? key.slice(8, 10) + "/" + key.slice(5, 7) : "");

export function buildOfferStrip(
  turmas: RevalidaSaleInput[],
  clinactPromo: ClinactPromotion | null,
): OfferStrip | null {
  const parts: OfferPart[] = [];
  const labels: string[] = [];

  const onSale = turmas.filter((t) => t.isOnSale && t.discountPercent != null);
  if (onSale.length > 0) {
    const pcts = onSale.map((t) => t.discountPercent as number);
    const max = Math.max(...pcts);
    const same = pcts.every((p) => p === max);
    // The latest end among the turmas on sale: the strip must not say an offer
    // ended while one turma still has it.
    const ends = onSale.map((t) => t.saleEndsAt).filter((e): e is string => !!e);
    const lastKey = ends.length === onSale.length
      ? ends.map((e) => saleWindowToDays(null, e).sale_last_day).sort().at(-1) ?? ""
      : "";
    parts.push({
      product: "revalida",
      text: `Revalida com ${same ? "" : "até "}${max}% OFF`,
      href: "/revalida#precos",
      until: lastKey ? ddmm(lastKey) : null,
    });
    for (const t of onSale) if (t.saleBadgeLabel) labels.push(t.saleBadgeLabel);
  }

  if (clinactPromo) {
    parts.push({
      product: "clinact",
      text: "ClinAct em condição de lançamento",
      href: "/clinact#planos",
      until: ddmm(clinactPromo.ends_on),
    });
    labels.push(clinactPromo.label);
  }

  if (parts.length === 0) return null;

  const untils = parts.map((p) => p.until);
  const sharedUntil = untils.every((u) => u && u === untils[0]) ? untils[0] : null;
  const pill = labels.some((l) => /black\s*friday/i.test(l)) ? "Black Friday" : "Oferta";
  return { pill, parts, sharedUntil };
}
