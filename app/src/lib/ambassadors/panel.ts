import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCohortsForSale } from "@/lib/queries/cohort-products";
import { toDateKeyBR } from "@/lib/br-date";

// Data for the ambassador panel (Contrato, cl. 8.1). Read-only in the first
// cycle: the panel shows what an ambassador has earned and when it becomes
// payable, and nothing here writes.
//
// Every figure is scoped to one ambassador. RLS already restricts the tables to
// `ambassador_id = current_ambassador_id()`, but these queries run through the
// service-role client, so the ambassador_id filter below is the real boundary —
// exactly the pattern flagged in CLAUDE.md for the member content route.

/** Minimum ordinary payout (cl. 7.2). */
export const MIN_PAYOUT_CENTS = 20000;

export type AmbassadorRecord = {
  id: number;
  code: string;
  status: string;
  commissionRateBps: number;
  profileType: string;
};

export type CommissionRow = {
  id: number;
  kind: string;
  status: string;
  amountCents: number;
  baseAmountCents: number;
  attributionSource: string | null;
  confirmedAt: string | null;
  releaseOn: string | null;
  notes: string | null;
};

export type PayoutRow = {
  id: number;
  referenceMonth: string;
  totalCents: number;
  status: string;
  paidAt: string | null;
};

export type PriceRow = {
  name: string;
  priceCents: number;
  discountCents: number;
  afterCouponCents: number;
  commissionCents: number;
};

export type PanelData = {
  ambassador: AmbassadorRecord;
  clicks: number;
  salesCount: number;
  pendingCents: number;
  availableCents: number;
  paidCents: number;
  commissions: CommissionRow[];
  payouts: PayoutRow[];
  prices: PriceRow[];
};

/** The ambassador record for a signed-in user, or null if they aren't one. */
export async function getAmbassadorForUser(userId: string): Promise<AmbassadorRecord | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ambassadors")
    .select("id, code, status, commission_rate_bps, profile_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getAmbassadorForUser failed", userId, error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as number,
    code: data.code as string,
    status: data.status as string,
    commissionRateBps: data.commission_rate_bps as number,
    profileType: data.profile_type as string,
  };
}

/**
 * The live price table (cl. 4.3, 8.1). Prices change, and a printed figure in a
 * PDF goes stale the day they do — so the panel computes from whatever is on
 * sale right now and the ambassador's own stamped rate. This is the official
 * source the contract points at, which is why nothing here is hardcoded.
 */
function buildPriceRows(
  products: Awaited<ReturnType<typeof getCohortsForSale>>,
  rateBps: number,
): PriceRow[] {
  return products.map((p) => {
    // The 5% buyer coupon, applied to the effective (post-sale) price. Integer
    // arithmetic throughout: the commission is money, so it never round-trips
    // through a float.
    const discountCents = Math.round(p.priceCents * 0.05);
    const afterCouponCents = p.priceCents - discountCents;
    return {
      name: p.name,
      priceCents: p.priceCents,
      discountCents,
      afterCouponCents,
      // Mirrors the DB trigger's formula so the panel can never quote a number
      // the ledger won't produce.
      commissionCents: Math.round((afterCouponCents * rateBps) / 10000),
    };
  });
}

export async function getPanelData(ambassador: AmbassadorRecord): Promise<PanelData> {
  const admin = createAdminClient();

  const [clicksRes, commissionsRes, payoutsRes, products] = await Promise.all([
    admin
      .from("ambassador_clicks")
      .select("id", { count: "exact", head: true })
      .eq("ambassador_id", ambassador.id),
    admin
      .from("commissions")
      .select(
        "id, kind, status, amount_cents, base_amount_cents, attribution_source, confirmed_at, release_on, notes",
      )
      .eq("ambassador_id", ambassador.id)
      .order("confirmed_at", { ascending: false })
      .limit(200),
    admin
      .from("payouts")
      .select("id, reference_month, total_cents, status, paid_at")
      .eq("ambassador_id", ambassador.id)
      .order("reference_month", { ascending: false })
      .limit(24),
    getCohortsForSale(),
  ]);

  if (commissionsRes.error) console.error("panel commissions query failed", commissionsRes.error);
  if (payoutsRes.error) console.error("panel payouts query failed", payoutsRes.error);

  const commissions: CommissionRow[] = (commissionsRes.data ?? []).map((c) => ({
    id: c.id as number,
    kind: c.kind as string,
    status: c.status as string,
    amountCents: c.amount_cents as number,
    baseAmountCents: c.base_amount_cents as number,
    attributionSource: (c.attribution_source as string | null) ?? null,
    confirmedAt: (c.confirmed_at as string | null) ?? null,
    releaseOn: (c.release_on as string | null) ?? null,
    notes: (c.notes as string | null) ?? null,
  }));

  const sumBy = (status: string) =>
    commissions.filter((c) => c.status === status).reduce((acc, c) => acc + c.amountCents, 0);

  return {
    ambassador,
    clicks: clicksRes.count ?? 0,
    // Only real sales count as sales; a negative adjustment is a correction to
    // one, not a second event.
    salesCount: commissions.filter((c) => c.kind === "sale" && c.status !== "cancelada").length,
    pendingCents: sumBy("pendente"),
    // 'liberada' rows include negative adjustments, so a chargeback correctly
    // reduces what is available rather than sitting in a separate bucket.
    availableCents: sumBy("liberada"),
    paidCents: sumBy("paga"),
    commissions,
    payouts: (payoutsRes.data ?? []).map((p) => ({
      id: p.id as number,
      referenceMonth: toDateKeyBR(p.reference_month as string),
      totalCents: p.total_cents as number,
      status: p.status as string,
      paidAt: (p.paid_at as string | null) ?? null,
    })),
    prices: buildPriceRows(products, ambassador.commissionRateBps),
  };
}
