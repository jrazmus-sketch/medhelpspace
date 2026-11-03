// The promotional price of a turma (cohorts.sale_price_cents) and its campaign window
// (sale_price_starts_at / sale_price_ends_at — schema-patch-cohort-sale-window.sql).
//
// Pure, no server imports: lib/queries/cohort-products.ts (storefront + charge), the
// coupon-offer pause (lib/cohort-promotions*) and the tests all use it. The database twin
// is cohort_sale_price_active(slug), which preview_coupon / redeem_coupon call — keep the
// two definitions identical.

import { endOfDayBRIso, startOfDayBRIso, toDateKeyBR } from "@/lib/br-date";

export type SaleWindowRow = {
  price_cents: number | null;
  sale_price_cents?: number | null;
  sale_price_starts_at?: string | null;
  sale_price_ends_at?: string | null;
};

/**
 * The promotional price in force at `nowMs`, or null. A sale is valid only when it is
 * non-negative and strictly below the base (the cohorts_sale_price_below_base CHECK says
 * the same) and `nowMs` is inside [starts, ends) — ends is EXCLUSIVE, so a campaign ending
 * "30/11 às 23h59" is stored as 01/12 00:00 BRT. A NULL bound is open on that side.
 */
export function activeSalePriceCents(row: SaleWindowRow, nowMs: number = Date.now()): number | null {
  const base = row.price_cents ?? 0;
  const sale = row.sale_price_cents ?? null;
  if (sale == null || base <= 0 || sale < 0 || sale >= base) return null;
  if (row.sale_price_starts_at) {
    const start = Date.parse(row.sale_price_starts_at);
    if (Number.isNaN(start) || nowMs < start) return null;
  }
  if (row.sale_price_ends_at) {
    const end = Date.parse(row.sale_price_ends_at);
    if (Number.isNaN(end) || nowMs >= end) return null;
  }
  return sale;
}

/** Shown when redeem/preview_coupon raise COUPON_NOT_COMBINABLE. */
export function couponNotCombinableMessage(saleBadgeLabel: string | null | undefined): string {
  const offer = saleBadgeLabel?.trim() ? `a oferta ${saleBadgeLabel.trim()}` : "a oferta em vigor";
  return `Este cupom não pode ser combinado com ${offer} desta turma.`;
}

/** The charge refused because the price changed since the checkout page was opened. */
export const PRICE_CHANGED_MESSAGE =
  "O valor desta turma mudou desde que você abriu esta página (a oferta pode ter terminado). " +
  "Atualize a página para ver o valor atual antes de pagar.";

// ── Admin: the window as Brazilian calendar days ─────────────────────────────
// Karina states a campaign in days ("de 02/11 até 30/11 às 23h59"), and the admin edits
// it from different time zones, so the form takes DAYS in Brasília time, never a
// browser-local datetime: first day → 00:00 BRT that day, last day → 00:00 BRT the NEXT
// day (exclusive). Black Friday 2026 = 2026-11-02 … 2026-11-30.

/** Days ("YYYY-MM-DD" or "") → stored window (ISO or null). */
export function saleWindowFromDays(
  firstDay: string,
  lastDay: string,
): { sale_price_starts_at: string | null; sale_price_ends_at: string | null } {
  return {
    sale_price_starts_at: firstDay ? startOfDayBRIso(firstDay) : null,
    sale_price_ends_at: lastDay ? endOfDayBRIso(lastDay) : null,
  };
}

/** Stored window → the days the admin form shows. */
export function saleWindowToDays(
  startsAt: string | null,
  endsAt: string | null,
): { sale_first_day: string; sale_last_day: string } {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  return {
    sale_first_day: startsAt ? toDateKeyBR(startsAt) : "",
    sale_last_day: Number.isNaN(end) ? "" : toDateKeyBR(new Date(end - 1)),
  };
}

/** "02/11/2026 – 30/11/2026" (either side may be open). Empty when no window. */
export function saleWindowLabel(startsAt: string | null, endsAt: string | null): string {
  const { sale_first_day, sale_last_day } = saleWindowToDays(startsAt, endsAt);
  const fmt = (k: string) => (k ? k.split("-").reverse().join("/") : "");
  if (!sale_first_day && !sale_last_day) return "";
  return `${fmt(sale_first_day) || "…"} – ${fmt(sale_last_day) || "…"}`;
}

/** "−50%" figure: whole percent off the base, rounded. */
export function discountPercentOf(baseCents: number, saleCents: number): number {
  return Math.round((1 - saleCents / baseCents) * 100);
}
