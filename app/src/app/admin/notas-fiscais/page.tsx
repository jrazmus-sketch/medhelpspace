import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionsEnv } from "@/lib/pagbank/subscriptions";
import { NotasFiscaisClient, type FiscalRow } from "./notas-fiscais-client";

export const metadata = { title: "Notas Fiscais" };

// Days of the satisfaction guarantee — a sale is only invoiced once it has
// cleared it. Applies to a Revalida order and to a ClinAct FIRST charge
// (a renewal is not a new purchase).
const GUARANTEE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// One fiscal screen for every product (Karina 2026-10-27): Revalida orders and
// each paid ClinAct invoice (first charge and every renewal) become rows of the
// same shape. Issuing stays MANUAL on the national Emissor; this page only
// shows the data to copy and records what was done there.
//
// internal_test rows (every record before 28/10/2026 — MedHelpSpace had made no
// sale yet — and any later test marked by hand) are history, not sales: the
// client lists them only under "Testes internos".

interface TomadorColumns {
  tomador_type: "aluno" | "pf" | "pj" | null;
  tomador_name: string | null;
  tomador_document: string | null;
  tomador_email: string | null;
  tomador_phone: string | null;
  tomador_cep: string | null;
  tomador_street: string | null;
  tomador_number: string | null;
  tomador_complement: string | null;
  tomador_neighborhood: string | null;
  tomador_city: string | null;
  tomador_state: string | null;
}

const TOMADOR_SELECT =
  "tomador_type, tomador_name, tomador_document, tomador_email, tomador_phone, tomador_cep, " +
  "tomador_street, tomador_number, tomador_complement, tomador_neighborhood, tomador_city, tomador_state";

/** The tomador chosen in "Dados para a nota fiscal", or null on a legacy row. */
function storedTomador(r: TomadorColumns): FiscalRow["tomador"] {
  if (!r.tomador_type) return null;
  return {
    type: r.tomador_type,
    name: r.tomador_name ?? "",
    doc: r.tomador_document ?? "",
    email: r.tomador_email ?? "",
    phone: r.tomador_phone ?? "",
    cep: r.tomador_cep ?? "",
    address: [r.tomador_street, r.tomador_number].filter(Boolean).join(", "),
    complement: r.tomador_complement ?? "",
    neighborhood: r.tomador_neighborhood ?? "",
    cityState: [r.tomador_city, r.tomador_state].filter(Boolean).join(" - "),
  };
}

interface RawOrder extends TomadorColumns {
  id: string;
  user_id: string;
  cohort_id: number;
  amount_cents: number;
  base_amount_cents: number | null;
  discount_cents: number | null;
  interest_cents: number | null;
  payment_method: string;
  cc_installments: number | null;
  status: string;
  created_at: string;
  // Payment time from the stored PagBank snapshot: a charge carries `paid_at`
  // at the top level; an order snapshot (card checkout) under `charges[0]`.
  charge_paid_at: string | null;
  order_paid_at: string | null;
  billing_person_type: string | null;
  billing_company_name: string | null;
  billing_cnpj: string | null;
  billing_company_email: string | null;
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
  nfse_cancelled_at: string | null;
  internal_test: boolean;
}

interface RawInvoice extends TomadorColumns {
  id: string;
  user_id: string;
  plan_key: "mensal" | "anual";
  occurrence: number;
  amount_cents: number;
  billed_at: string;
  paid_at: string;
  period_start: string;
  period_end: string;
  billing_name: string | null;
  billing_tax_id: string | null;
  billing_phone: string | null;
  refunded_at: string | null;
  nfse_status: string | null;
  nfse_number: string | null;
  nfse_verificacao: string | null;
  nfse_issued_at: string | null;
  nfse_cancelled_at: string | null;
  internal_test: boolean;
}

export default async function NotasFiscaisPage() {
  // Role gate: this page exposes buyer fiscal PII (CPF, CNPJ, address), so
  // restrict to billing roles even though the layout already blocks members.
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

  // Paid AND refunded orders: a refunded sale stays visible ("Reembolsada"),
  // and one whose nota was already issued is the one that needs cancelling.
  const [{ data: ordersData }, { data: invoicesData }, { data: profiles }, { data: cohorts }] =
    await Promise.all([
      admin
        .from("orders")
        .select(
          "id, user_id, cohort_id, amount_cents, base_amount_cents, discount_cents, " +
            "interest_cents, payment_method, cc_installments, status, created_at, " +
            "charge_paid_at:pagbank_response->>paid_at, " +
            "order_paid_at:pagbank_response->charges->0->>paid_at, " +
            "billing_person_type, billing_company_name, billing_cnpj, billing_company_email, " +
            "billing_first_name, billing_last_name, billing_cpf, billing_cep, " +
            "billing_address, billing_number, billing_neighborhood, billing_city, " +
            "billing_state, billing_phone, " +
            "nfse_status, nfse_number, nfse_verificacao, nfse_issued_at, nfse_cancelled_at, internal_test, " +
            TOMADOR_SELECT,
        )
        .in("status", ["paid", "refunded"])
        .order("created_at", { ascending: false })
        .limit(1000),
      admin
        .from("clinact_invoices")
        .select(
          "id, user_id, plan_key, occurrence, amount_cents, billed_at, paid_at, " +
            "period_start, period_end, billing_name, billing_tax_id, billing_phone, refunded_at, " +
            "nfse_status, nfse_number, nfse_verificacao, nfse_issued_at, nfse_cancelled_at, " +
            "internal_test, " +
            TOMADOR_SELECT,
        )
        // Sandbox invoices never need a nota.
        .eq("environment", getSubscriptionsEnv())
        .order("paid_at", { ascending: false })
        .limit(1000),
      admin.from("profiles").select("id, email, display_name"),
      admin.from("cohorts").select("id, name"),
    ]);
  const orders = (ordersData ?? []) as unknown as RawOrder[];
  const invoices = (invoicesData ?? []) as unknown as RawInvoice[];

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { email: p.email as string, name: p.display_name as string | null },
    ]),
  );
  const cohortMap = new Map(
    (cohorts ?? []).map((c) => [c.id as number, c.name as string]),
  );

  // eslint-disable-next-line react-hooks/purity -- server component, one render per request
  const now = Date.now();

  const orderRows: FiscalRow[] = orders.map((o) => {
    const account = profileMap.get(o.user_id);
    const isPj = o.billing_person_type === "pj";
    const studentName = `${o.billing_first_name ?? ""} ${o.billing_last_name ?? ""}`.trim();
    const original = o.base_amount_cents ?? o.amount_cents;
    const discount = o.discount_cents ?? 0;
    const eligibleMs = new Date(o.created_at).getTime() + GUARANTEE_DAYS * DAY_MS;
    return {
      kind: "revalida",
      id: o.id,
      userId: o.user_id,
      product: `Turma ${cohortMap.get(o.cohort_id) ?? "—"}`,
      descriptionTarget: cohortMap.get(o.cohort_id) ?? "—",
      planKey: null,
      occurrence: null,
      periodStart: null,
      periodEnd: null,
      saleDate: o.created_at,
      paidAt: o.charge_paid_at ?? o.order_paid_at ?? null,
      paymentMethod: o.payment_method,
      installments: o.cc_installments,
      refunded: o.status === "refunded",
      originalCents: original,
      discountCents: discount,
      // Orders from before coupons/interest were tracked have no base — then
      // the charged amount IS the original price and nothing was added.
      surchargeCents: o.interest_cents ?? 0,
      totalCents: o.amount_cents,
      // The tomador chosen in "Dados para a nota fiscal" (orders from 28/10/2026).
      // Before that block, Pessoa Física = the student was the tomador.
      tomador: storedTomador(o) ?? {
        type: isPj ? "pj" : "aluno",
        name: isPj ? o.billing_company_name ?? "" : studentName,
        doc: isPj ? o.billing_cnpj ?? "" : o.billing_cpf ?? "",
        email: isPj ? o.billing_company_email ?? "" : account?.email ?? "",
        phone: o.billing_phone ?? "",
        cep: o.billing_cep ?? "",
        address: [o.billing_address, o.billing_number].filter(Boolean).join(", "),
        complement: "",
        neighborhood: o.billing_neighborhood ?? "",
        cityState: [o.billing_city, o.billing_state].filter(Boolean).join(" - "),
      },
      // A separate student only when someone other than the student is the tomador.
      // billing_first/last_name + billing_cpf are always the student.
      student: (o.tomador_type ? o.tomador_type !== "aluno" : isPj)
        ? { name: studentName, cpf: o.billing_cpf ?? "", email: account?.email ?? "" }
        : null,
      listName:
        o.tomador_name ||
        (isPj ? o.billing_company_name ?? "" : studentName || account?.name || account?.email || "—"),
      listEmail: account?.email ?? "—",
      eligibleAt: new Date(eligibleMs).toISOString(),
      inGuarantee: now < eligibleMs,
      nfseStatus: o.nfse_status,
      nfseNumber: o.nfse_number,
      nfseVerificacao: o.nfse_verificacao,
      nfseIssuedAt: o.nfse_issued_at,
      nfseCancelledAt: o.nfse_cancelled_at,
      internalTest: o.internal_test,
    };
  });

  const invoiceRows: FiscalRow[] = invoices.map((i) => {
    const account = profileMap.get(i.user_id);
    const firstCharge = i.occurrence <= 1;
    const eligibleMs = new Date(i.paid_at).getTime() + GUARANTEE_DAYS * DAY_MS;
    return {
      kind: "clinact",
      id: i.id,
      userId: i.user_id,
      product: `ClinAct — plano ${i.plan_key}`,
      descriptionTarget: i.plan_key,
      planKey: i.plan_key,
      occurrence: i.occurrence,
      periodStart: i.period_start,
      periodEnd: i.period_end,
      saleDate: i.billed_at,
      paidAt: i.paid_at,
      paymentMethod: "credit_card",
      installments: 1,
      refunded: i.refunded_at != null,
      originalCents: i.amount_cents,
      discountCents: 0,
      surchargeCents: 0,
      totalCents: i.amount_cents,
      // The tomador is what was chosen in "Dados para a nota fiscal" — never the
      // cardholder (billing_*), which is payment data only. A subscription from
      // before that block has none: shown as "não informado", not guessed.
      tomador: storedTomador(i),
      // The student is the account; listed apart whenever it is not the tomador.
      student:
        i.tomador_type === "aluno"
          ? null
          : { name: account?.name ?? "", cpf: "", email: account?.email ?? "" },
      listName: i.tomador_name || account?.name || account?.email || "—",
      listEmail: account?.email ?? "—",
      eligibleAt: new Date(eligibleMs).toISOString(),
      inGuarantee: firstCharge && now < eligibleMs,
      nfseStatus: i.nfse_status,
      nfseNumber: i.nfse_number,
      nfseVerificacao: i.nfse_verificacao,
      nfseIssuedAt: i.nfse_issued_at,
      nfseCancelledAt: i.nfse_cancelled_at,
      internalTest: i.internal_test,
    };
  });

  const rows = [...orderRows, ...invoiceRows].sort(
    (a, b) => new Date(b.paidAt ?? b.saleDate).getTime() - new Date(a.paidAt ?? a.saleDate).getTime(),
  );

  return <NotasFiscaisClient rows={rows} guaranteeDays={GUARANTEE_DAYS} />;
}
