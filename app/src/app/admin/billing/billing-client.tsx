"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Search, Download, RefreshCw } from "lucide-react";

interface OrderRow {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  cohortName: string;
  amountCents: number;
  paymentMethod: string;
  status: string;
  pagbankChargeId: string | null;
  ccBrand: string | null;
  ccInstallments: number | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  paid:       "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  declined:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  refunded:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

function fmt(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function BillingClient({
  rows,
  totalPaidCents,
}: {
  rows: OrderRow[];
  totalPaidCents: number;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundDone, setRefundDone] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const filtered = rows.filter((r) => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.email.toLowerCase().includes(q) ||
      (r.displayName ?? "").toLowerCase().includes(q) ||
      r.cohortName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  function exportCsv() {
    const header = "ID,Email,Nome,Turma,Valor,Método,Parcelas,Status,Data";
    const lines = filtered.map((r) =>
      [
        r.id,
        r.email,
        r.displayName ?? "",
        r.cohortName,
        (r.amountCents / 100).toFixed(2),
        r.paymentMethod === "pix" ? "Pix" : `Cartão${r.ccBrand ? ` (${r.ccBrand})` : ""}`,
        r.ccInstallments ?? 1,
        r.status,
        fmtDate(r.createdAt),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header, ...lines].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function handleRefund(row: OrderRow) {
    setRefundTarget(row);
    setRefundError(null);
    setRefundReason("");
  }

  function confirmRefund() {
    if (!refundTarget) return;
    const id = refundTarget.id;
    startTransition(async () => {
      setRefundError(null);
      try {
        const res = await fetch("/api/admin/billing/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: id, reason: refundReason.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erro ao estornar");
        setRefundDone((prev) => new Set(prev).add(id));
        setRefundTarget(null);
      } catch (e) {
        setRefundError(e instanceof Error ? e.message : "Erro inesperado");
      }
    });
  }

  const statusLabel: Record<string, string> = {
    paid:      t("billing.statusPaid"),
    pending:   t("billing.statusPending"),
    declined:  t("billing.statusDeclined"),
    cancelled: t("billing.statusCancelled"),
    refunded:  t("billing.statusRefunded"),
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{t("billing.title")}</h1>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          {t("billing.export")}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: t("billing.totalOrders"),   value: rows.length },
          { label: t("billing.paidOrders"),    value: rows.filter((r) => r.status === "paid").length },
          { label: t("billing.totalRevenue"),  value: fmt(totalPaidCents) },
          { label: t("billing.pendingOrders"), value: rows.filter((r) => r.status === "pending").length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-surface-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("billing.searchPlaceholder")}
            className="pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="all">{t("billing.allStatuses")}</option>
          <option value="paid">{t("billing.statusPaid")}</option>
          <option value="pending">{t("billing.statusPending")}</option>
          <option value="declined">{t("billing.statusDeclined")}</option>
          <option value="cancelled">{t("billing.statusCancelled")}</option>
          <option value="refunded">{t("billing.statusRefunded")}</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left">
              {[
                t("billing.colDate"),
                t("billing.colUser"),
                t("billing.colCohort"),
                t("billing.colAmount"),
                t("billing.colMethod"),
                t("billing.colStatus"),
                "",
              ].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const isRefunded = refundDone.has(row.id) || row.status === "refunded";
              const effectiveStatus = refundDone.has(row.id) ? "refunded" : row.status;
              return (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-1/50 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground leading-tight">{row.displayName ?? row.email}</p>
                    {row.displayName && (
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground whitespace-nowrap">{row.cohortName}</td>
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{fmt(row.amountCents)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {row.paymentMethod === "pix"
                      ? "Pix"
                      : `Cartão${row.ccBrand ? ` · ${row.ccBrand}` : ""}${row.ccInstallments && row.ccInstallments > 1 ? ` · ${row.ccInstallments}x` : ""}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[effectiveStatus] ?? STATUS_COLORS.pending}`}>
                      {statusLabel[effectiveStatus] ?? effectiveStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "paid" && !isRefunded && (
                      <button
                        type="button"
                        onClick={() => handleRefund(row)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors ml-auto"
                      >
                        <RefreshCw className="h-3 w-3" />
                        {t("billing.refund")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Refund confirmation modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="text-base font-semibold text-foreground mb-2">{t("billing.refundTitle")}</h2>
            <p className="text-sm text-muted-foreground mb-1">
              {t("billing.refundDesc", { email: refundTarget.email })}
            </p>
            <p className="text-sm font-semibold text-foreground mb-4">
              {fmt(refundTarget.amountCents)} · {refundTarget.cohortName}
            </p>
            <label className="block mb-4">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("billing.refundReasonLabel")}
              </span>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t("billing.refundReasonPlaceholder")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
            {refundError && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {refundError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground hover:bg-surface-1 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmRefund}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
              >
                {t("billing.confirmRefund")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
