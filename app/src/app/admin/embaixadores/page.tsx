import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCohortsBasic } from "@/lib/queries/cohort-products";
import { EmbaixadoresClient, type AmbassadorRow, type PayoutRow } from "./embaixadores-client";

export const metadata = { title: "Embaixadores" };

export default async function EmbaixadoresPage() {
  // Money-facing — billing tier only, mirroring /admin/coupons.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!actingProfile || !["super_admin", "billing_admin"].includes(actingProfile.role as string)) {
    redirect("/admin");
  }

  const [{ data: ambassadors }, { data: commissions }, { data: payouts }, { data: clicks }, cohorts, { data: coupons }] =
    await Promise.all([
      admin
        .from("ambassadors")
        .select(
          "id, user_id, code, status, profile_type, commission_rate_bps, contract_ends_on, coupon_id, access_cohort_id, terminated_for_cause, termination_kind, termination_ground, first_valid_sale_at, termination_reason, created_at",
        )
        .order("created_at", { ascending: false }),
      admin.from("commissions").select("id, ambassador_id, kind, status, amount_cents, release_on, payout_id"),
      admin
        .from("payouts")
        .select("id, ambassador_id, reference_month, total_cents, status, nf_number, nf_url, paid_at, is_final_settlement, rejection_reason")
        .order("reference_month", { ascending: false }),
      admin.from("ambassador_clicks").select("ambassador_id"),
      getAllCohortsBasic(),
      admin.from("coupons").select("id, code, discount_type, discount_value").eq("active", true),
    ]);

  const userIds = [...new Set((ambassadors ?? []).map((a) => a.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, display_name").in("id", userIds)
    : { data: [] };
  const pmap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { email: (p.email as string) ?? "", name: (p.display_name as string | null) ?? null },
    ]),
  );

  // Clicks aren't aggregated in SQL because the pilot is a dozen ambassadors and
  // a count-per-row round trip each would be slower than one pass over the list.
  const clickCounts = new Map<number, number>();
  for (const c of clicks ?? []) {
    const id = c.ambassador_id as number;
    clickCounts.set(id, (clickCounts.get(id) ?? 0) + 1);
  }

  // cl. 12.6 is evaluated in the DB so the panel can never disagree with the
  // contract. One RPC per ambassador is fine at pilot scale (a dozen rows).
  const accessEnds = new Map<number, string | null>();
  await Promise.all(
    (ambassadors ?? []).map(async (a) => {
      const { data } = await admin.rpc("ambassador_access_ends_on", {
        p_ambassador_id: a.id as number,
      });
      accessEnds.set(a.id as number, (data as string | null) ?? null);
    }),
  );

  const rows: AmbassadorRow[] = (ambassadors ?? []).map((a) => {
    const mine = (commissions ?? []).filter((c) => c.ambassador_id === a.id);
    const sumBy = (status: string) =>
      mine.filter((c) => c.status === status).reduce((acc, c) => acc + (c.amount_cents as number), 0);
    const profile = pmap.get(a.user_id as string);
    return {
      id: a.id as number,
      code: a.code as string,
      email: profile?.email ?? "—",
      displayName: profile?.name ?? null,
      status: a.status as string,
      profileType: a.profile_type as string,
      commissionRateBps: a.commission_rate_bps as number,
      contractEndsOn: (a.contract_ends_on as string | null) ?? null,
      couponId: (a.coupon_id as number | null) ?? null,
      accessCohortId: (a.access_cohort_id as number | null) ?? null,
      terminatedForCause: Boolean(a.terminated_for_cause),
      terminationKind: (a.termination_kind as string | null) ?? null,
      terminationGround: (a.termination_ground as string | null) ?? null,
      firstValidSaleAt: (a.first_valid_sale_at as string | null) ?? null,
      accessEndsOn: accessEnds.get(a.id as number) ?? null,
      terminationReason: (a.termination_reason as string | null) ?? null,
      clicks: clickCounts.get(a.id as number) ?? 0,
      sales: mine.filter((c) => c.kind === "sale" && c.status !== "cancelada").length,
      pendingCents: sumBy("pendente"),
      availableCents: sumBy("liberada"),
      inReviewCents: sumBy("em_analise"),
      paidCents: sumBy("paga"),
    };
  });

  const payoutRows: PayoutRow[] = (payouts ?? []).map((p) => ({
    id: p.id as number,
    ambassadorId: p.ambassador_id as number,
    referenceMonth: String(p.reference_month),
    totalCents: p.total_cents as number,
    status: p.status as string,
    nfNumber: (p.nf_number as string | null) ?? null,
    nfUrl: (p.nf_url as string | null) ?? null,
    paidAt: (p.paid_at as string | null) ?? null,
    isFinalSettlement: Boolean(p.is_final_settlement),
    rejectionReason: (p.rejection_reason as string | null) ?? null,
  }));

  return (
    <EmbaixadoresClient
      ambassadors={rows}
      payouts={payoutRows}
      cohorts={(cohorts ?? []).map((c) => ({ id: c.id, name: c.name }))}
      coupons={(coupons ?? []).map((c) => ({
        id: c.id as number,
        code: c.code as string,
        label: `${c.code} (${
          c.discount_type === "percent" ? `${c.discount_value}%` : `R$ ${(Number(c.discount_value) / 100).toFixed(2)}`
        })`,
      }))}
    />
  );
}
