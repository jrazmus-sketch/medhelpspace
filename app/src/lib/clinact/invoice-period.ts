// Período de referência of a ClinAct invoice, for the NFS-e screen. Pure and
// dependency-light so it can be tested; lib/clinact/invoices.ts (server-only)
// is what writes it.
//
// The period starts on the Brasília calendar day PagBank opened the invoice
// (its billing date — a charge recovered two days later still covers the same
// period) and ends the day before the next one would start.

import { addDaysKey, toDateKeyBR } from "@/lib/br-date";
import type { ClinactPlanKey } from "@/lib/clinact/plans";

/** Add calendar months to a YYYY-MM-DD key, clamping to the month's last day (31/01 + 1 → 28/02). */
export function addMonthsKey(key: string, months: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function referencePeriod(
  billedAt: string,
  planKey: ClinactPlanKey,
): { start: string; end: string } {
  const start = toDateKeyBR(billedAt);
  const next = addMonthsKey(start, planKey === "anual" ? 12 : 1);
  return { start, end: addDaysKey(next, -1) };
}
