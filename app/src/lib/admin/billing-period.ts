/**
 * Administração → Financeiro: period filter + CSV for the accountant (Karina 2026-11-19).
 *
 * PURE and client-safe (the page filters in the browser). A period is matched on the ORDER date — the "Data" column
 * the screen shows — as a calendar day in Brasília (lib/br-date), never the server's UTC day, so an order placed at
 * 22h on 30/11 belongs to November. Internal tests (orders.internal_test) are not sales: they never count in the
 * indicators and are only listed / exported in the "Testes internos" view.
 */
import { toDateKeyBR } from "@/lib/br-date";

export type BillingPeriod =
  | { mode: "all" }
  | { mode: "month"; year: number; month: number } // month 1–12
  | { mode: "day"; date: string } //                  YYYY-MM-DD
  | { mode: "range"; from: string; to: string }; //   YYYY-MM-DD, inclusive; either side may be empty

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Is this order (by its created_at) inside the period? An incomplete day/range filters nothing yet. */
export function inPeriod(createdAt: string, p: BillingPeriod): boolean {
  if (p.mode === "all") return true;
  const key = toDateKeyBR(createdAt);
  if (p.mode === "month") return key.startsWith(`${p.year}-${String(p.month).padStart(2, "0")}-`);
  if (p.mode === "day") return !DATE_KEY.test(p.date) || key === p.date;
  const from = DATE_KEY.test(p.from) ? p.from : "";
  const to = DATE_KEY.test(p.to) ? p.to : "";
  if (from && to && from > to) return key >= to && key <= from; // typed backwards: still the same interval
  return (!from || key >= from) && (!to || key <= to);
}

/** financeiro-2026-11.csv · financeiro-2026-11-19.csv · financeiro-2026-11-01_a_2026-11-30.csv · financeiro-completo.csv */
export function csvFileName(p: BillingPeriod, tests: boolean): string {
  const base = tests ? "financeiro-testes-internos" : "financeiro";
  if (p.mode === "month") return `${base}-${p.year}-${String(p.month).padStart(2, "0")}.csv`;
  if (p.mode === "day" && DATE_KEY.test(p.date)) return `${base}-${p.date}.csv`;
  if (p.mode === "range" && (DATE_KEY.test(p.from) || DATE_KEY.test(p.to))) {
    const [a, b] = [p.from, p.to].filter((k) => DATE_KEY.test(k)).sort();
    return `${base}-${b ? `${a}_a_${b}` : a}.csv`;
  }
  return `${base}-completo.csv`;
}

export interface BillingCsvRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  pagbankChargeId: string | null;
  clientName: string;
  email: string;
  studentCpf: string;
  tomadorName: string;
  tomadorDoc: string;
  cohortName: string;
  originalCents: number;
  discountCents: number;
  surchargeCents: number;
  amountCents: number;
  paymentMethod: string;
  ccBrand: string | null;
  ccInstallments: number | null;
  status: string;
  internalTest: boolean;
}

export const STATUS_PT: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  declined: "Recusado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  free: "Matrícula gratuita",
};

/** A paid R$ 0 order is a 100%-coupon enrollment — no charge, not a sale (Karina 2026-10-28). */
export const isFreeEnrollment = (r: { status: string; amountCents: number }) =>
  r.status === "paid" && r.amountCents === 0;

function dateTimeBR(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
  return t.replace(",", "");
}

/** 1234.5 -> "1234,50" (no thousands separator: a spreadsheet reads it as a number). */
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * CSV for Excel / LibreOffice in Portuguese: `;` separator, decimal comma, UTF-8 with BOM (so "Março", "Cartão"
 * open correctly), CRLF line ends. One row per order, in the order given.
 */
export function buildBillingCsv(rows: BillingCsvRow[]): string {
  const header = [
    "Data do pedido", "Data do pagamento", "Pedido", "Cobrança PagBank", "Cliente", "E-mail", "CPF do aluno",
    "Tomador da nota", "CPF/CNPJ do tomador", "Produto", "Turma", "Valor original (R$)", "Desconto (R$)",
    "Acréscimo do parcelamento (R$)", "Valor cobrado (R$)", "Método de pagamento", "Parcelas", "Status", "Teste interno",
  ];
  const cell = (v: string | number) => {
    const s = String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) => {
    const free = isFreeEnrollment(r);
    const method = free
      ? "Sem cobrança"
      : r.paymentMethod === "pix"
        ? "Pix"
        : `Cartão de crédito${r.ccBrand ? ` (${r.ccBrand})` : ""}`;
    return [
      dateTimeBR(r.createdAt),
      r.status === "paid" || r.status === "refunded" ? dateTimeBR(r.paidAt) : "",
      r.id,
      r.pagbankChargeId ?? "",
      r.clientName,
      r.email,
      r.studentCpf,
      r.tomadorName,
      r.tomadorDoc,
      "Revalida",
      r.cohortName,
      money(r.originalCents),
      money(r.discountCents),
      money(r.surchargeCents),
      money(r.amountCents),
      method,
      free ? "" : r.paymentMethod === "pix" ? 1 : (r.ccInstallments ?? 1),
      STATUS_PT[free ? "free" : r.status] ?? r.status,
      r.internalTest ? "Sim" : "Não",
    ].map(cell).join(";");
  });
  return "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n") + "\r\n";
}

export interface BillingStats {
  total: number;
  paid: number;
  revenueCents: number;
  pending: number;
}

/** Indicators for the period: tests and free enrollments never count as sales; revenue = paid orders' charges. */
export function billingStats(rows: { status: string; amountCents: number; internalTest: boolean }[]): BillingStats {
  const real = rows.filter((r) => !r.internalTest);
  const paid = real.filter((r) => r.status === "paid" && !isFreeEnrollment(r));
  return {
    total: real.length,
    paid: paid.length,
    revenueCents: paid.reduce((s, r) => s + r.amountCents, 0),
    pending: real.filter((r) => r.status === "pending").length,
  };
}
