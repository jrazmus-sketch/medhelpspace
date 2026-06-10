import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllCohortsBasic } from "@/lib/queries/cohort-products";
import { CouponsClient } from "./coupons-client";

export const metadata = { title: "Cupons" };

export default async function CouponsPage() {
  // Money-facing — restrict to the billing tier (super_admin + billing_admin).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const [{ data: coupons }, { data: redemptions }] = await Promise.all([
    admin.from("coupons").select("*").order("created_at", { ascending: false }),
    admin
      .from("coupon_redemptions")
      .select("id, coupon_id, user_id, amount_discount_cents, redeemed_at")
      .order("redeemed_at", { ascending: false }),
  ]);

  const userIds = [...new Set((redemptions ?? []).map((r) => r.user_id as string))];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email, display_name").in("id", userIds)
    : { data: [] };

  const pmap = new Map(
    (profiles ?? []).map((p) => [p.id as string, { email: p.email as string, name: p.display_name as string | null }]),
  );

  const couponRows = (coupons ?? []).map((c) => ({
    id: c.id as number,
    code: c.code as string,
    discountType: c.discount_type as "percent" | "fixed_cents",
    discountValue: c.discount_value as number,
    maxRedemptions: c.max_redemptions as number | null,
    maxUsesPerUser: c.max_uses_per_user as number | null,
    redemptionsUsed: c.redemptions_used as number,
    startsAt: c.starts_at as string | null,
    expiresAt: c.expires_at as string | null,
    active: c.active as boolean,
    cohortSlugs: (c.applies_to_cohort_slugs as string[] | null) ?? null,
    notes: c.notes as string | null,
  }));

  const redemptionRows = (redemptions ?? []).map((r) => ({
    id: r.id as number,
    couponId: r.coupon_id as number,
    email: pmap.get(r.user_id as string)?.email ?? "—",
    displayName: pmap.get(r.user_id as string)?.name ?? null,
    discountCents: r.amount_discount_cents as number,
    redeemedAt: r.redeemed_at as string,
  }));

  const cohortOptions = (await getAllCohortsBasic()).map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <CouponsClient coupons={couponRows} redemptions={redemptionRows} cohortOptions={cohortOptions} />
  );
}
