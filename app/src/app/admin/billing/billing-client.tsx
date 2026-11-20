"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { Search, Download, RefreshCw, FlaskConical, Undo2 } from "lucide-react";
import { todayKeyBR, toDateKeyBR } from "@/lib/br-date";
import {
  inPeriod,
  csvFileName,
  buildBillingCsv,
  billingStats,
  isFreeEnrollment,
  type BillingPeriod,
} from "@/lib/admin/billing-period";

export interface OrderRow {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  clientName: string;
  studentCpf: string;
  tomadorName: string;
  tomadorDoc: string;
  cohortName: string;
  originalCents: number;
  discountCents: number;
  surchargeCents: number;
  amountCents: number;
  paymentMethod: string;
  status: string;
  pagbankChargeId: string | null;
  ccBrand: string | null;
  ccInstallments: number | null;
  createdAt: string;
  paidAt: string | null;
  internalTest: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  paid:       "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  declined:   "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled:  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  refunded:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  free:       "bg-brand/10 text-brand-text",
};

const CONTROL =
  "min-h-10 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand";

function fmt(cents: number) {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

type PeriodMode = BillingPeriod["mode"];

export function BillingClient({ rows }: { rows: OrderRow[] }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = i18n.language === "en" ? "en" : "pt-BR";

  const today = todayKeyBR();
  const [curYear, curMonth] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"real" | "tests">("real");
  const [mode, setMode] = useState<PeriodMode>("all");
  const [year, setYear] = useState(curYear);
  const [month, setMonth] = useState(curMonth);
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [testConfirm, setTestConfirm] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSaving, setTestSaving] = useState(false);

  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundDone, setRefundDone] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const period: BillingPeriod = useMemo(() => {
    if (mode === "month") return { mode, year, month };
    if (mode === "day") return { mode, date: day };
    if (mode === "range") return { mode, from, to };
    return { mode: "all" };
  }, [mode, year, month, day, from, to]);

  // Years with orders, plus the current one.
  const years = useMemo(() => {
    const ys = new Set<number>([curYear]);
    for (const r of rows) ys.add(Number(toDateKeyBR(r.createdAt).slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [rows, curYear]);

  const monthName = (m: number) =>
    new Date(Date.UTC(2026, m - 1, 15)).toLocaleString(locale, { month: "long", timeZone: "UTC" });
  const dateName = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" });

  const periodName = (() => {
    const ok = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
    if (period.mode === "month") {
      return new Date(Date.UTC(period.year, period.month - 1, 15)).toLocaleDateString(locale, {
        month: "long", year: "numeric", timeZone: "UTC",
      });
    }
    if (period.mode === "day" && ok(period.date)) return dateName(period.date);
    if (period.mode === "range") {
      const [a, b] = [period.from, period.to].filter(ok).sort();
      if (ok(period.from) && ok(period.to)) return t("billing.periodRangeName", { from: dateName(a), to: dateName(b) });
      if (ok(period.from)) return t("billing.periodFromName", { date: dateName(period.from) });
      if (ok(period.to)) return t("billing.periodToName", { date: dateName(period.to) });
    }
    return t("billing.periodAll");
  })();

  // Period first (drives the indicators), then the view (real / tests), status and search (drive list + export).
  const inPeriodRows = rows.filter((r) => inPeriod(r.createdAt, period));
  const stats = billingStats(inPeriodRows);
  const filtered = inPeriodRows.filter((r) => {
    if (view === "tests" ? !r.internalTest : r.internalTest) return false;
    const effective = isFreeEnrollment(r) ? "free" : r.status;
    const matchStatus = statusFilter === "all" || r.status === statusFilter || effective === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.email.toLowerCase().includes(q) ||
      (r.displayName ?? "").toLowerCase().includes(q) ||
      r.clientName.toLowerCase().includes(q) ||
      r.cohortName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });
  const testsInPeriod = inPeriodRows.filter((r) => r.internalTest).length;

  const visibleSelected = filtered.filter((r) => selected.has(r.id));
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  function changeView(v: "real" | "tests") {
    setView(v);
    setSelected(new Set());
  }

  function exportCsv() {
    const csv = buildBillingCsv(filtered);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = csvFileName(period, view === "tests");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function confirmTestChange() {
    const ids = visibleSelected.map((r) => r.id);
    if (ids.length === 0) return;
    setTestSaving(true);
    setTestError(null);
    try {
      const res = await fetch("/api/admin/billing/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: ids, test: view === "real" }),
      });
      if (!res.ok) throw new Error();
      setTestConfirm(false);
      setSelected(new Set());
      router.refresh();
    } catch {
      setTestError(t("billing.testError"));
    } finally {
      setTestSaving(false);
    }
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
    free:      t("billing.statusFreeShort"),
  };

  const selectedTotal = visibleSelected.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{t("billing.title")}</h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex min-h-10 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {t("billing.exportCount", { count: filtered.length })}
        </button>
      </div>

      {/* Period */}
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-xs font-medium text-muted-foreground">{t("billing.periodLabel")}</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as PeriodMode)} className={CONTROL}>
              <option value="all">{t("billing.periodAll")}</option>
              <option value="month">{t("billing.periodMonth")}</option>
              <option value="day">{t("billing.periodDay")}</option>
              <option value="range">{t("billing.periodRange")}</option>
            </select>
          </label>

          {mode === "month" && (
            <>
              <label className="flex flex-1 flex-col gap-1 sm:flex-none">
                <span className="text-xs font-medium text-muted-foreground">{t("billing.monthLabel")}</span>
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={CONTROL}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>{monthName(m)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 sm:flex-none">
                <span className="text-xs font-medium text-muted-foreground">{t("billing.yearLabel")}</span>
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={CONTROL}>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          {mode === "day" && (
            <label className="flex w-full flex-col gap-1 sm:w-auto">
              <span className="text-xs font-medium text-muted-foreground">{t("billing.dayLabel")}</span>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={CONTROL} />
            </label>
          )}

          {mode === "range" && (
            <>
              <label className="flex flex-1 flex-col gap-1 sm:flex-none">
                <span className="text-xs font-medium text-muted-foreground">{t("billing.fromLabel")}</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={CONTROL} />
              </label>
              <label className="flex flex-1 flex-col gap-1 sm:flex-none">
                <span className="text-xs font-medium text-muted-foreground">{t("billing.toLabel")}</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={CONTROL} />
              </label>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("billing.periodNote")}</p>
      </div>

      {/* Summary stats — the selected period, real orders only */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("billing.statsFor", { period: periodName })}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: t("billing.totalOrders"),   value: stats.total },
            { label: t("billing.paidOrders"),    value: stats.paid },
            { label: t("billing.totalRevenue"),  value: fmt(stats.revenueCents) },
            { label: t("billing.pendingOrders"), value: stats.pending },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-border bg-surface-1 p-4">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-bold text-foreground sm:text-2xl">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("billing.statsTestsNote", { count: testsInPeriod })}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("billing.searchPlaceholder")}
            className={`${CONTROL} w-full pl-9 placeholder:text-muted-foreground sm:w-72`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${CONTROL} flex-1 sm:flex-none`}
        >
          <option value="all">{t("billing.allStatuses")}</option>
          <option value="paid">{t("billing.statusPaid")}</option>
          <option value="pending">{t("billing.statusPending")}</option>
          <option value="declined">{t("billing.statusDeclined")}</option>
          <option value="cancelled">{t("billing.statusCancelled")}</option>
          <option value="refunded">{t("billing.statusRefunded")}</option>
          <option value="free">{t("billing.statusFreeShort")}</option>
        </select>
        <select
          value={view}
          onChange={(e) => changeView(e.target.value as "real" | "tests")}
          aria-label={t("billing.viewLabel")}
          className={`${CONTROL} flex-1 sm:flex-none`}
        >
          <option value="real">{t("billing.viewReal")}</option>
          <option value="tests">{t("billing.viewTests", { count: testsInPeriod })}</option>
        </select>
      </div>

      {view === "tests" && (
        <p className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t("billing.testsViewNote")}
        </p>
      )}

      {/* Selection bar */}
      {visibleSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
          <span className="text-sm text-foreground">
            {t("billing.selectedCount", { count: visibleSelected.length, total: fmt(selectedTotal) })}
          </span>
          <button
            type="button"
            onClick={() => { setTestError(null); setTestConfirm(true); }}
            className="flex min-h-10 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            {view === "real" ? <FlaskConical className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
            {view === "real" ? t("billing.markTest") : t("billing.unmarkTest")}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="min-h-10 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("billing.clearSelection")}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left">
              <th className="w-10 px-2 py-1">
                <label className="flex h-10 w-10 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    disabled={filtered.length === 0}
                    aria-label={t("billing.selectAll")}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                </label>
              </th>
              {[
                t("billing.colDate"),
                t("billing.colUser"),
                t("billing.colCohort"),
                t("billing.colAmount"),
                t("billing.colMethod"),
                t("billing.colStatus"),
                "",
              ].map((h, i) => (
                <th key={`${h}-${i}`} className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
            {filtered.map((row) => {
              const isRefunded = refundDone.has(row.id) || row.status === "refunded";
              const effectiveStatus = refundDone.has(row.id)
                ? "refunded"
                : isFreeEnrollment(row)
                  ? "free"
                  : row.status;
              return (
                <tr key={row.id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-1/50">
                  <td className="px-2 py-1">
                    <label className="flex h-10 w-10 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={t("billing.selectRow")}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                    </label>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium leading-tight text-foreground">{row.displayName ?? row.email}</p>
                    {row.displayName && (
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">{row.cohortName}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">{fmt(row.amountCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {isFreeEnrollment(row)
                      ? "—"
                      : row.paymentMethod === "pix"
                      ? "Pix"
                      : `Cartão${row.ccBrand ? ` · ${row.ccBrand}` : ""}${row.ccInstallments && row.ccInstallments > 1 ? ` · ${row.ccInstallments}x` : ""}`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[effectiveStatus] ?? STATUS_COLORS.pending}`}>
                        {statusLabel[effectiveStatus] ?? effectiveStatus}
                      </span>
                      {row.internalTest && (
                        <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {t("billing.testBadge")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "paid" && !isRefunded && (
                      <button
                        type="button"
                        onClick={() => handleRefund(row)}
                        className="ml-auto flex min-h-10 items-center gap-1 px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
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

      {/* Internal-test confirmation */}
      {testConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {view === "real" ? t("billing.testConfirmTitle") : t("billing.untestConfirmTitle")}
            </h2>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              {view === "real"
                ? t("billing.testConfirmDesc", { count: visibleSelected.length, total: fmt(selectedTotal) })
                : t("billing.untestConfirmDesc", { count: visibleSelected.length, total: fmt(selectedTotal) })}
            </p>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-1 p-2 text-xs text-foreground">
              {visibleSelected.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="truncate">{fmtDate(r.createdAt)} · {r.displayName ?? r.email}</span>
                  <span className="shrink-0 font-medium">{fmt(r.amountCents)} · {statusLabel[isFreeEnrollment(r) ? "free" : r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
            {testError && (
              <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {testError}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTestConfirm(false)}
                disabled={testSaving}
                className="min-h-11 flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-1"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmTestChange}
                disabled={testSaving}
                className="min-h-11 flex-1 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {testSaving ? t("billing.testSaving") : t("billing.testConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund confirmation modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-2 text-base font-semibold text-foreground">{t("billing.refundTitle")}</h2>
            <p className="mb-1 text-sm text-muted-foreground">
              {t("billing.refundDesc", { email: refundTarget.email })}
            </p>
            <p className="mb-4 text-sm font-semibold text-foreground">
              {fmt(refundTarget.amountCents)} · {refundTarget.cohortName}
            </p>
            <label className="mb-4 block">
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
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-1"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={confirmRefund}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
