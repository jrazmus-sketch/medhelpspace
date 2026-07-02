import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BillingClient } from "./billing-client";

export const metadata = { title: "Financeiro" };

export default async function BillingPage() {
  // Role gate: this page exposes financial data, so restrict to billing roles.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!me || !["super_admin", "billing_admin"].includes(me.role as string)) {
    redirect("/admin");
  }

  const { data: orders } = await admin
    .from("orders")
    .select("id, user_id, cohort_id, amount_cents, payment_method, status, pagbank_charge_id, cc_brand, cc_installments, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, display_name");

  const { data: cohorts } = await admin
    .from("cohorts")
    .select("id, name");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, { email: p.email as string, name: p.display_name as string | null }]),
  );
  const cohortMap = new Map(
    (cohorts ?? []).map((c) => [c.id as number, c.name as string]),
  );

  const rows = (orders ?? []).map((o) => ({
    id: o.id as string,
    userId: o.user_id as string,
    email: profileMap.get(o.user_id as string)?.email ?? "—",
    displayName: profileMap.get(o.user_id as string)?.name ?? null,
    cohortName: cohortMap.get(o.cohort_id as number) ?? "—",
    amountCents: o.amount_cents as number,
    paymentMethod: o.payment_method as string,
    status: o.status as string,
    pagbankChargeId: o.pagbank_charge_id as string | null,
    ccBrand: o.cc_brand as string | null,
    ccInstallments: o.cc_installments as number | null,
    createdAt: o.created_at as string,
  }));

  const totalPaidCents = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amountCents, 0);

  return (
    <BillingClient
      rows={rows}
      totalPaidCents={totalPaidCents}
    />
  );
}
