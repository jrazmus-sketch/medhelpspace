import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import type { CohortProduct } from "@/types/supabase";
import type { PromoBannerData } from "@/components/landing/promo-banner";
import { getEmailTemplate } from "@/lib/email";
import {
  formatDateKeyBR,
  lastDayKeyBR,
  pausedCouponCohorts,
  templateMentionsCoupon,
  type ActivePromotion,
  type CouponSaleState,
} from "@/lib/cohort-promotions-shared";
import { getCohortsForSale } from "@/lib/queries/cohort-products";

// Cohort promotions — the DB side. Schema + the rules they enforce:
// schema-patch-cohort-promotions.sql. Pure helpers (and the ActivePromotion type)
// live in cohort-promotions-shared.ts so client components and tests can use them.

type TurmaRef = { id: number; slug: string; name: string };
type PromotionRow = {
  id: number;
  slug: string;
  starts_at: string;
  ends_at: string;
  blocks_coupons: boolean;
  cohort: TurmaRef | TurmaRef[] | null;
  target: TurmaRef | TurmaRef[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Promotions open right now, newest first. Service-role read (the table has no
 * public policies). On a read error this returns [] — the storefront then simply
 * shows no banner, and the coupon refusal still holds because redeem_coupon
 * enforces it in the DB.
 */
export const getActivePromotions = cache(async (): Promise<ActivePromotion[]> => {
  if (USE_MOCK_DATA) return [];

  const nowIso = new Date().toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cohort_promotions")
    .select(
      "id, slug, starts_at, ends_at, blocks_coupons, " +
        "cohort:cohorts!cohort_promotions_cohort_id_fkey(id, slug, name), " +
        "target:cohorts!cohort_promotions_rollover_to_cohort_id_fkey(id, slug, name)",
    )
    .eq("active", true)
    .lte("starts_at", nowIso)
    .gt("ends_at", nowIso)
    .order("starts_at", { ascending: false });

  if (error) {
    console.error("getActivePromotions failed", error);
    return [];
  }

  const out: ActivePromotion[] = [];
  for (const row of (data ?? []) as unknown as PromotionRow[]) {
    const cohort = one(row.cohort);
    const target = one(row.target);
    if (!cohort || !target) continue;
    out.push({
      id: row.id,
      slug: row.slug,
      cohortId: cohort.id,
      cohortSlug: cohort.slug,
      cohortName: cohort.name,
      rolloverToCohortId: target.id,
      rolloverToCohortSlug: target.slug,
      rolloverToCohortName: target.name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      blocksCoupons: row.blocks_coupons,
      lastDayLabel: formatDateKeyBR(lastDayKeyBR(row.ends_at)),
    });
  }
  return out;
});

/** The open promotion on this turma, if any. */
export async function getActivePromotionForCohort(
  cohortSlug: string,
): Promise<ActivePromotion | null> {
  const promotions = await getActivePromotions();
  return promotions.find((p) => p.cohortSlug === cohortSlug) ?? null;
}

/**
 * Turmas whose promotional price is in force right now (the storefront's own rule,
 * lib/cohort-sale.ts) and the coupons an admin marked combinable with it. On a read
 * error the coupon list is empty — offers then pause, which is the safe side: the DB
 * would refuse those coupons anyway (redeem_coupon → COUPON_NOT_COMBINABLE).
 */
export const getCouponSaleState = cache(async (): Promise<CouponSaleState> => {
  if (USE_MOCK_DATA) return { saleCohorts: new Set(), combinableCodes: new Set() };
  const saleCohorts = new Set<string>();
  try {
    for (const c of await getCohortsForSale()) if (c.isOnSale) saleCohorts.add(c.slug);
  } catch (e) {
    console.error("getCouponSaleState: cohorts read failed", e);
  }
  const combinableCodes = new Set<string>();
  if (saleCohorts.size > 0) {
    const { data, error } = await createAdminClient()
      .from("coupons")
      .select("code")
      .eq("combinable_with_offers", true);
    if (error) console.error("getCouponSaleState: coupons read failed", error);
    for (const r of (data ?? []) as { code: string }[]) combinableCodes.add(r.code.toUpperCase());
  }
  return { saleCohorts, combinableCodes };
});

/**
 * Turmas whose coupon OFFERS (drip e-mails, reward pages) are paused right now: a
 * launch condition that closes coupons, or a promotional price the offered code does
 * not combine with (lib/cohort-promotions-shared.ts → pausedCouponCohorts).
 */
export async function getPausedCouponCohorts(): Promise<Set<string>> {
  const [promotions, sale] = await Promise.all([getActivePromotions(), getCouponSaleState()]);
  return pausedCouponCohorts(promotions, sale);
}

/**
 * Everything a drip cron needs to honour the coupon pause for one run: which
 * turmas are paused, and a memoised "does this template show the coupon?".
 */
export async function getCouponOfferPause(): Promise<{
  paused: Set<string>;
  templateShowsCoupon: (kind: string) => Promise<boolean>;
}> {
  const paused = await getPausedCouponCohorts();
  const memo = new Map<string, Promise<boolean>>();
  return {
    paused,
    templateShowsCoupon: (kind) => {
      let hit = memo.get(kind);
      if (!hit) {
        hit = getEmailTemplate(kind).then(templateMentionsCoupon, () => false);
        memo.set(kind, hit);
      }
      return hit;
    },
  };
}

/**
 * Move this user's membership onto its promotion turma NOW if it is due. The
 * daily cron does this for everyone; this is the fallback requireActiveMembership
 * runs before bouncing a user to /loja, so a missed cron run can never lock a promo
 * buyer out between turmas. Returns true when a row was moved.
 */
export async function applyDueRolloverFor(userId: string): Promise<boolean> {
  if (USE_MOCK_DATA) return false;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("apply_promotion_rollovers", { p_user_id: userId });
  if (error) {
    console.error("apply_promotion_rollovers (single user) failed", userId, error);
    return false;
  }
  return ((data ?? []) as { out_result: string }[]).some((r) => r.out_result === "moved");
}

/**
 * The storefront banner for the open promotion whose turma is on sale (null when
 * none). Price comes from the same CohortProduct the checkout charges, so the
 * banner can never quote a different number.
 */
export async function getPromoBanner(cohorts: CohortProduct[]): Promise<PromoBannerData | null> {
  for (const p of await getActivePromotions()) {
    const product = cohorts.find((c) => c.slug === p.cohortSlug);
    if (!product) continue;
    return {
      cohortSlug: p.cohortSlug,
      cohortName: p.cohortName,
      rolloverToCohortName: p.rolloverToCohortName,
      endsAt: p.endsAt,
      lastDayLabel: p.lastDayLabel,
      priceLabel: product.priceLabel,
    };
  }
  return null;
}
