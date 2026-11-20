import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BillingClient, type OrderRow } from "./billing-client";

export const metadata = { title: "Financeiro" };

const ORDER_COLUMNS =
  "id, user_id, cohort_id, amount_cents, base_amount_cents, discount_cents, interest_cents, payment_method, status, " +
  "pagbank_charge_id, cc_brand, cc_installments, created_at, internal_test, " +
  "charge_paid_at:pagbank_response->>paid_at, order_paid_at:pagbank_response->charges->0->>paid_at, " +
  "billing_person_type, billing_company_name, billing_cnpj, billing_first_name, billing_last_name, billing_cpf, " +
  "tomador_type, tomador_name, tomador_document";

interface RawOrder {
  id: string;
  user_id: string;
  cohort_id: number;
  amount_cents: number;
  base_amount_cents: number | null;
  discount_cents: number | null;
  interest_cents: number | null;
  payment_method: string;
  status: string;
  pagbank_charge_id: string | null;
  cc_brand: string | null;
  cc_installments: number | null;
  created_at: string;
  internal_test: boolean;
  charge_paid_at: string | null;
  order_paid_at: string | null;
  billing_person_type: string | null;
  billing_company_name: string | null;
  billing_cnpj: string | null;
  billing_first_name: string | null;
  billing_last_name: string | null;
  billing_cpf: string | null;
  tomador_type: string | null;
  tomador_name: string | null;
  tomador_document: string | null;
}

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

  // EVERY order (the period filter and the accountant's export need the whole history), read in pages:
  // PostgREST silently caps a single read at 1000 rows.
  const orders: RawOrder[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as RawOrder[];
    orders.push(...page);
    if (page.length < 1000) break;
  }

  // Only the profiles of the buyers (never the whole table — also capped at 1000).
  const userIds = [...new Set(orders.map((o) => o.user_id))];
  const profileMap = new Map<string, { email: string; name: string | null }>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await admin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", userIds.slice(i, i + 200));
    for (const p of data ?? []) {
      profileMap.set(p.id as string, { email: p.email as string, name: p.display_name as string | null });
    }
  }

  const { data: cohorts } = await admin.from("cohorts").select("id, name");
  const cohortMap = new Map((cohorts ?? []).map((c) => [c.id as number, c.name as string]));

  const rows: OrderRow[] = orders.map((o) => {
    const account = profileMap.get(o.user_id);
    const studentName = `${o.billing_first_name ?? ""} ${o.billing_last_name ?? ""}`.trim();
    const isPj = o.billing_person_type === "pj";
    // Tomador: the one chosen in "Dados para a nota fiscal" (orders from 28/10/2026); before that block, a PJ order
    // named the company and a PF order the student — same rule as the Notas Fiscais screen.
    const tomadorName = o.tomador_type
      ? o.tomador_name ?? ""
      : isPj
        ? o.billing_company_name ?? ""
        : studentName;
    const tomadorDoc = o.tomador_type ? o.tomador_document ?? "" : isPj ? o.billing_cnpj ?? "" : o.billing_cpf ?? "";
    return {
      id: o.id,
      userId: o.user_id,
      email: account?.email ?? "—",
      displayName: account?.name ?? null,
      clientName: studentName || account?.name || "",
      studentCpf: o.billing_cpf ?? "",
      tomadorName,
      tomadorDoc,
      cohortName: cohortMap.get(o.cohort_id) ?? "—",
      // Orders from before coupons/interest were tracked have no base: the charged amount IS the original price.
      originalCents: o.base_amount_cents ?? o.amount_cents,
      discountCents: o.discount_cents ?? 0,
      surchargeCents: o.interest_cents ?? 0,
      amountCents: o.amount_cents,
      paymentMethod: o.payment_method,
      status: o.status,
      pagbankChargeId: o.pagbank_charge_id,
      ccBrand: o.cc_brand,
      ccInstallments: o.cc_installments,
      createdAt: o.created_at,
      paidAt: o.charge_paid_at ?? o.order_paid_at ?? null,
      internalTest: o.internal_test,
    };
  });

  return <BillingClient rows={rows} />;
}
