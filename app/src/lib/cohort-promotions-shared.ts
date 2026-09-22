// Pure helpers for cohort promotions ("condição especial de lançamento").
//
// No server imports on purpose: the cron routes, the storefront, client
// components and the node:test suite all need these, and the DB-backed loader
// (lib/cohort-promotions.ts) is server-only. Same split as library-filters.ts.

import { toDateKeyBR } from "@/lib/br-date";
import { UNDECIDED_COHORT } from "@/lib/magnet/links";

export type ActivePromotion = {
  id: number;
  slug: string;
  /** The turma the buyer purchases (at its normal price). */
  cohortId: number;
  cohortSlug: string;
  cohortName: string;
  /** The turma the buyer is moved onto when `cohort` closes. */
  rolloverToCohortId: number;
  rolloverToCohortSlug: string;
  rolloverToCohortName: string;
  startsAt: string;
  /** EXCLUSIVE upper bound (local midnight after the last valid day). */
  endsAt: string;
  blocksCoupons: boolean;
  /** Last valid day in Brasília, "DD/MM/AAAA" — what the banner says. */
  lastDayLabel: string;
};

/** Shown wherever a coupon is refused because of the promotion. */
export const COUPON_BLOCKED_MESSAGE =
  "Durante a condição especial de lançamento, cupons não se aplicam a esta turma.";

/** True while `now` is inside [startsAt, endsAt). */
export function isPromotionOpen(
  p: { startsAt: string; endsAt: string },
  nowMs: number = Date.now(),
): boolean {
  const start = Date.parse(p.startsAt);
  const end = Date.parse(p.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return nowMs >= start && nowMs < end;
}

/**
 * The last day an exclusive `endsAt` still covers, as a Brazilian calendar key.
 * 2026-10-06T03:00Z (midnight BRT) → "2026-10-05".
 */
export function lastDayKeyBR(endsAtIso: string): string {
  const end = Date.parse(endsAtIso);
  if (Number.isNaN(end)) return "";
  return toDateKeyBR(new Date(end - 1));
}

/** "2026-10-05" → "05/10/2026". */
export function formatDateKeyBR(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Turma slugs whose coupon OFFERS (drip emails, reward pages) are paused right
 * now. The undecided track counts too whenever any blocking promotion is open:
 * its all-turma FLASH5 would be refused on the promo turma, and "don't send a
 * code we then refuse at checkout" is the whole point (Karina, decision 3).
 */
export function pausedCouponCohorts(promotions: ActivePromotion[]): Set<string> {
  const paused = new Set<string>();
  for (const p of promotions) {
    if (!p.blocksCoupons) continue;
    paused.add(p.cohortSlug);
    paused.add(UNDECIDED_COHORT);
  }
  return paused;
}

/**
 * The coupon to OFFER a lead for this turma, or null while offers are paused.
 * `table` is WELCOME_COUPONS / RECOVERY_COUPONS; `fallbackCohort` mirrors the
 * crons' existing "unknown turma → the 2027.1 code" behaviour, and is itself
 * subject to the pause.
 */
export function offeredCoupon<T>(
  table: Record<string, T>,
  cohort: string,
  paused: Set<string>,
  fallbackCohort?: string,
): T | null {
  if (table[cohort] !== undefined) return paused.has(cohort) ? null : table[cohort];
  if (fallbackCohort && table[fallbackCohort] !== undefined) {
    return paused.has(fallbackCohort) ? null : table[fallbackCohort];
  }
  return null;
}

const COUPON_VAR_RE = /\{\{\s*coupon/;

/**
 * Does this email template put the coupon in front of the reader? Checked on the
 * RESOLVED template (DB row or code default), so a template Karina edits later to
 * mention {{coupon}} is paused too, without a code change.
 */
export function templateMentionsCoupon(
  t: Partial<Record<"subject" | "kicker" | "headline" | "body_html" | "cta_label" | "cta_href", string>> | null | undefined,
): boolean {
  if (!t) return false;
  return [t.subject, t.kicker, t.headline, t.body_html, t.cta_label, t.cta_href].some(
    (s) => typeof s === "string" && COUPON_VAR_RE.test(s),
  );
}
