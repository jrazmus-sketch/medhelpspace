import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NotasFiscaisClient } from "./notas-fiscais-client";

export const metadata = { title: "Notas Fiscais" };

// Days of the satisfaction guarantee — only invoice sales that have cleared it.
const GUARANTEE_DAYS = 7;

// Raw order shape we read. The generated Supabase types don't yet include the new
// nfse_* columns (the patch isn't applied), so we cast the rows to this.
interface RawOrder {
  id: string;
  user_id: string;
  cohort_id: number;
  amount_cents: number;
  status: string;
  created_at: string;
  billing_first_name: string | null;
  billing_last_name: string | null;
  billing_cpf: string | null;
  billing_cep: string | null;
  billing_address: string | null;
  billing_number: string | null;
  billing_neighborhood: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_phone: string | null;
  nfse_status: string | null;
  nfse_number: string | null;
  nfse_verificacao: string | null;
  nfse_issued_at: string | null;
}

export default async function NotasFiscaisPage() {
  // Role gate: this page exposes buyer fiscal PII (CPF, address), so restrict to
  // billing roles even though the layout already blocks plain members.
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

  // Paid orders are the ones that need a nota. (Refunded sales never get one; a
  // refund after issuance is a rare, manually-handled edge at this volume.)
  const { data: ordersData } = await admin
    .from("orders")
    .select(
      "id, user_id, cohort_id, amount_cents, status, created_at, " +
        "billing_first_name, billing_last_name, billing_cpf, billing_cep, " +
        "billing_address, billing_number, billing_neighborhood, billing_city, " +
        "billing_state, billing_phone, " +
        "nfse_status, nfse_number, nfse_verificacao, nfse_issued_at",
    )
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1000);
  const orders = (ordersData ?? []) as unknown as RawOrder[];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, display_name");
  const { data: cohorts } = await admin.from("cohorts").select("id, name");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { email: p.email as string, name: p.display_name as string | null },
    ]),
  );
  const cohortMap = new Map(
    (cohorts ?? []).map((c) => [c.id as number, c.name as string]),
  );

  const now = Date.now();
  const guaranteeMs = GUARANTEE_DAYS * 24 * 60 * 60 * 1000;

  const rows = orders.map((o) => {
    const createdMs = new Date(o.created_at as string).getTime();
    const eligibleMs = createdMs + guaranteeMs;
    const nfseStatus = (o.nfse_status as string | null) ?? null;
    const handled = nfseStatus === "issued" || nfseStatus === "skipped";

    return {
      id: o.id as string,
      userId: o.user_id as string,
      email: profileMap.get(o.user_id as string)?.email ?? "—",
      accountName: profileMap.get(o.user_id as string)?.name ?? null,
      cohortName: cohortMap.get(o.cohort_id as number) ?? "—",
      amountCents: o.amount_cents as number,
      createdAt: o.created_at as string,
      eligibleAt: new Date(eligibleMs).toISOString(),
      ready: !handled && now >= eligibleMs,
      waiting: !handled && now < eligibleMs,
      // Tomador (buyer) snapshot captured at checkout.
      firstName: (o.billing_first_name as string | null) ?? "",
      lastName: (o.billing_last_name as string | null) ?? "",
      cpf: (o.billing_cpf as string | null) ?? "",
      cep: (o.billing_cep as string | null) ?? "",
      address: (o.billing_address as string | null) ?? "",
      number: (o.billing_number as string | null) ?? "",
      neighborhood: (o.billing_neighborhood as string | null) ?? "",
      city: (o.billing_city as string | null) ?? "",
      state: (o.billing_state as string | null) ?? "",
      phone: (o.billing_phone as string | null) ?? "",
      // NFS-e outcome (manually recorded).
      nfseStatus,
      nfseNumber: (o.nfse_number as string | null) ?? null,
      nfseVerificacao: (o.nfse_verificacao as string | null) ?? null,
      nfseIssuedAt: (o.nfse_issued_at as string | null) ?? null,
    };
  });

  return <NotasFiscaisClient rows={rows} guaranteeDays={GUARANTEE_DAYS} />;
}
