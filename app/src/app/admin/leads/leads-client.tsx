"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  MoreHorizontal,
} from "lucide-react";
import type { LeadRow, LeadsSummary, LeadTier } from "@/lib/admin/leads";
import { LeadDetailDrawer } from "@/components/admin/lead-detail-drawer";
import { BulkAssignCohortModal } from "@/components/admin/bulk-assign-cohort-modal";
import { BulkResendModal } from "@/components/admin/bulk-resend-modal";
import { ConfirmModal } from "@/components/admin/confirm-modal";
import {
  bulkMarkAsTest,
  bulkAssignCohort,
  bulkResendDripEmail,
  bulkSetDripStatus,
  bulkSetArchived,
} from "@/actions/leads";

interface Props {
  rows: LeadRow[];
  summary: LeadsSummary;
}

interface SortState {
  sortBy: "created" | "lastActivity" | "dripStep" | "tier" | "email" | null;
  sortAsc: boolean;
}

const tierColor: Record<LeadTier, string> = {
  customer: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  hot: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  nurture: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  suppressed: "bg-surface-2 text-muted-foreground",
};

const statusColor: Record<string, string> = {
  active: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  converted: "bg-green-500/15 text-green-700 dark:text-green-400",
  unsubscribed: "bg-surface-2 text-muted-foreground",
  bounced: "bg-red-500/15 text-red-600 dark:text-red-400",
  unverified: "bg-surface-2 text-muted-foreground",
};

function effectiveStatus(row: LeadRow): string {
  if (row.dripStatus === "active" && !row.verified) return "unverified";
  return row.dripStatus;
}

function cohortShort(slug: string | null): string {
  if (!slug) return "—";
  if (slug === "undecided") return "Indeciso";
  const m = slug.match(/(\d{4})-?(\d)$/);
  return m ? `${m[1]}.${m[2]}` : slug;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function estimatedOpens(tier: LeadTier): number | null {
  if (tier === "hot") return 2;
  if (tier === "nurture") return 1;
  return null;
}

function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join("|");
  let str = String(value);
  // Neutralize formula injection: prepend ' if starts with formula trigger
  const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
  if (FORMULA_TRIGGERS.test(str)) {
    str = "'" + str;
  }
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  if (str.includes(",") || str.includes("\n") || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateLeadsCSV(rows: LeadRow[]): string {
  const headers = [
    "email",
    "firstName",
    "created",
    "lastActivity",
    "dripStep",
    "score",
    "questionsAnswered",
    "completed",
    "weakSpecialties",
    "verified",
    "tier",
    "captureSource",
    "source",
    "isTest",
  ];

  const csvRows = [headers.join(",")];

  for (const row of rows) {
    const lastActivity = row.lastEmailedAt ?? row.createdAt;
    const csvRow = [
      formatCsvValue(row.email),
      formatCsvValue(row.firstName),
      formatCsvValue(row.createdAt),
      formatCsvValue(lastActivity),
      formatCsvValue(row.dripStep),
      formatCsvValue(row.score ?? ""),
      formatCsvValue(row.questionsAnswered ?? 0),
      formatCsvValue(row.completed),
      formatCsvValue(row.weakSpecialties),
      formatCsvValue(row.verified),
      formatCsvValue(row.tier),
      formatCsvValue(row.captureSource),
      formatCsvValue(row.source),
      formatCsvValue(row.isTest),
    ];
    csvRows.push(csvRow.join(","));
  }

  return csvRows.join("\n");
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function LeadsClient({ rows, summary }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"all" | LeadTier>("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [capture, setCapture] = useState("all");
  const [funnel, setFunnel] = useState("all");
  const [showTests, setShowTests] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [sort, setSort] = useState<SortState>({ sortBy: "created", sortAsc: false });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCohortModal, setShowCohortModal] = useState(false);
  const [showResendModal, setShowResendModal] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // Which drip-status change is awaiting confirmation (both have email-flow
  // consequences, so both confirm before firing).
  const [confirmAction, setConfirmAction] = useState<"unsubscribe" | "reactivate" | null>(null);

  function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const sourceLabel = (s: string | null) => s ?? t("leads.sourceOrganic");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const results = rows.filter((r) => {
      if (!showTests && r.isTest) return false;
      if (!showArchived && r.isArchived) return false;
      if (tier !== "all" && r.tier !== tier) return false;
      if (status !== "all" && effectiveStatus(r) !== status) return false;
      if (source !== "all" && (r.utmSource ?? "__organic__") !== source) return false;
      if (capture !== "all") {
        const cs = r.captureSource === "exit_intent" ? "exit_intent" : "quiz";
        if (cs !== capture) return false;
      }
      if (funnel !== "all" && r.source !== funnel) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.firstName ?? "").toLowerCase().includes(q)
      );
    });

    if (sort.sortBy) {
      results.sort((a, b) => {
        let aVal: string | number = 0, bVal: string | number = 0;
        if (sort.sortBy === "created") {
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
        } else if (sort.sortBy === "lastActivity") {
          const aDate = a.lastEmailedAt ?? a.createdAt;
          const bDate = b.lastEmailedAt ?? b.createdAt;
          aVal = new Date(aDate).getTime();
          bVal = new Date(bDate).getTime();
        } else if (sort.sortBy === "dripStep") {
          aVal = a.dripStep;
          bVal = b.dripStep;
        } else if (sort.sortBy === "tier") {
          const tierOrder = { customer: 0, hot: 1, nurture: 2, suppressed: 3 };
          aVal = tierOrder[a.tier];
          bVal = tierOrder[b.tier];
        } else if (sort.sortBy === "email") {
          aVal = a.email.toLowerCase();
          bVal = b.email.toLowerCase();
        }
        if (sort.sortAsc) {
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        } else {
          return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
        }
      });
    }
    return results;
  }, [rows, search, tier, status, source, capture, funnel, showTests, showArchived, sort]);

  const hasExitIntent = useMemo(
    () => rows.some((r) => r.captureSource === "exit_intent"),
    [rows],
  );

  const hasFlashcards = useMemo(
    () => rows.some((r) => r.source === "flashcards-50"),
    [rows],
  );

  const hasArchived = useMemo(() => rows.some((r) => r.isArchived), [rows]);

  const statuses = useMemo(
    () => [...new Set(rows.map(effectiveStatus))],
    [rows],
  );

  // Drip-step distribution among leads actually IN the drip (active + verified,
  // quiz funnel — mirrors the lead-drip cron's target set). Tests/archived out.
  const dripDist = useMemo(() => {
    const counts = new Map<number, number>();
    let total = 0;
    for (const r of rows) {
      if (r.isTest || r.isArchived) continue;
      if (r.dripStatus !== "active" || !r.verified) continue;
      if (r.source === "flashcards-50") continue;
      counts.set(r.dripStep, (counts.get(r.dripStep) ?? 0) + 1);
      total++;
    }
    const steps = [...counts.entries()]
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => a.step - b.step);
    return { steps, total };
  }, [rows]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const selectedRows = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)),
    [filtered, selectedIds],
  );

  const canResendEmail = useMemo(() => {
    if (selectedRows.length === 0) return false;
    // Flashcards-funnel leads have their own sequence (lead-fc-*) — the quiz
    // templates would be wrong, and the server action refuses them.
    return selectedRows.every(
      (r) => r.dripStatus === "active" && r.source !== "flashcards-50",
    );
  }, [selectedRows]);

  const canUnsubscribe = selectedRows.some(
    (r) => r.dripStatus === "active" || r.dripStatus === "bounced",
  );
  const canReactivate = selectedRows.some(
    (r) => r.dripStatus === "unsubscribed" || r.dripStatus === "bounced",
  );
  const canArchive = selectedRows.some((r) => !r.isArchived);
  const canUnarchive = selectedRows.some((r) => r.isArchived);

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleRowToggle = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Shared success epilogue: toast, clear selection, and re-fetch the server
  // rows so the table reflects the write (the rows prop is server-component data).
  const finishBulk = (msg: string) => {
    setSuccessMessage(msg);
    setSelectedIds(new Set());
    router.refresh();
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleBulkMarkAsTest = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const leadIds = Array.from(selectedIds);
      await bulkMarkAsTest(leadIds);
      const count = leadIds.length;
      finishBulk(
        t(count === 1 ? "leads.bulkActionSuccessOne" : "leads.bulkActionSuccessOther", {
          count,
        }),
      );
    } catch (error) {
      console.error("Bulk action error:", error);
      setErrorMessage(t("leads.bulkActionError"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkAssignCohort = async (cohort: string) => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const leadIds = Array.from(selectedIds);
      await bulkAssignCohort(leadIds, cohort);
      const count = leadIds.length;
      finishBulk(
        t(
          count === 1 ? "leads.bulkAssignCohortSuccessOne" : "leads.bulkAssignCohortSuccessOther",
          { count },
        ),
      );
    } catch (error) {
      console.error("Bulk assign cohort error:", error);
      setErrorMessage(t("leads.bulkActionError"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkResendEmail = async (step: number | null) => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const leadIds = Array.from(selectedIds);
      const result = await bulkResendDripEmail(leadIds, step);
      if (result.success) {
        finishBulk(
          t(result.sent === 1 ? "leads.bulkResendSuccess" : "leads.bulkResendSuccessOther", {
            count: result.sent,
          }),
        );
      } else if (result.failed.length > 0) {
        const failedEmails = result.failed.map((f) => f.email).join(", ");
        const errorMsg = t("leads.bulkResendPartialError", {
          count: result.sent,
          total: leadIds.length,
          failedCount: result.failed.length,
        });
        setErrorMessage(`${errorMsg} — ${failedEmails}`);
        router.refresh();
      }
    } catch (error) {
      console.error("Bulk resend error:", error);
      const msg = error instanceof Error ? error.message : t("leads.bulkActionError");
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkDripStatus = async (action: "unsubscribe" | "reactivate") => {
    if (selectedIds.size === 0) return;
    setConfirmAction(null);
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const result = await bulkSetDripStatus(Array.from(selectedIds), action);
      const base = action === "unsubscribe" ? "leads.bulkUnsubscribeSuccess" : "leads.bulkReactivateSuccess";
      let msg = t(result.count === 1 ? `${base}One` : `${base}Other`, { count: result.count });
      if (result.skipped > 0) {
        msg += ` ${t("leads.bulkSkippedNote", { count: result.skipped })}`;
      }
      finishBulk(msg);
    } catch (error) {
      console.error("Bulk drip-status error:", error);
      setErrorMessage(t("leads.bulkActionError"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkArchive = async (archived: boolean) => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const result = await bulkSetArchived(Array.from(selectedIds), archived);
      const base = archived ? "leads.bulkArchiveSuccess" : "leads.bulkUnarchiveSuccess";
      finishBulk(t(result.count === 1 ? `${base}One` : `${base}Other`, { count: result.count }));
    } catch (error) {
      console.error("Bulk archive error:", error);
      setErrorMessage(t("leads.bulkActionError"));
    } finally {
      setIsProcessing(false);
    }
  };

  function TierPill({ row }: { row: LeadRow }) {
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierColor[row.tier]}`}>
        {t(`leads.tier_${row.tier}`)}
      </span>
    );
  }

  function StatusPill({ row }: { row: LeadRow }) {
    const st = effectiveStatus(row);
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[st] ?? statusColor.active}`}>
          {t(`leads.status_${st}`, { defaultValue: st })}
        </span>
        {row.isArchived && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <Archive className="h-3 w-3" />
            {t("leads.isArchived")}
          </span>
        )}
      </span>
    );
  }

  function LeadIdentity({ row }: { row: LeadRow }) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="truncate">{row.firstName || row.email.split("@")[0]}</span>
          {row.verified && (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
      </div>
    );
  }

  function Progress({ row }: { row: LeadRow }) {
    if (row.source === "flashcards-50") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs font-medium text-fuchsia-600 dark:text-fuchsia-300">
          <span aria-hidden>🎴</span>
          {t("leads.funnel_flashcards")}
        </span>
      );
    }
    if (row.captureSource === "exit_intent") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">
          <span aria-hidden>⏳</span>
          {t("leads.captureExitIntent")}
        </span>
      );
    }
    const answered = row.questionsAnswered ?? 0;
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
        <span className={row.completed ? "font-medium" : "text-muted-foreground"}>{answered}/15</span>
        {row.score != null && (
          <span className="text-xs text-muted-foreground">
            · {t("leads.scoreShort", { score: row.score })}
          </span>
        )}
      </div>
    );
  }

  function DripStep({ row }: { row: LeadRow }) {
    return (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {t("leads.colDripFormat", { step: row.dripStep, total: 6 })}
      </span>
    );
  }

  function EmailEngagement({ row }: { row: LeadRow }) {
    if (!row.lastEmailedAt) return <span className="text-muted-foreground text-xs">—</span>;
    const opens = estimatedOpens(row.tier);
    if (opens === null) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-300">
        {t("leads.engagementOpens", { count: opens })}
      </span>
    );
  }

  // Plain render helper (NOT a component) — an inline component here would be
  // recreated every render and trips react-hooks/static-components.
  function renderSortableHeader(label: string, field: SortState["sortBy"]) {
    const isActive = sort.sortBy === field;
    const handleClick = () => {
      if (isActive) {
        setSort({ sortBy: field, sortAsc: !sort.sortAsc });
      } else {
        setSort({ sortBy: field, sortAsc: false });
      }
    };
    return (
      <button
        onClick={handleClick}
        className="cursor-pointer hover:text-foreground transition-colors inline-flex items-center gap-1"
      >
        {label}
        {isActive && <span>{sort.sortAsc ? "↑" : "↓"}</span>}
      </button>
    );
  }

  const statTiles = [
    { label: t("leads.statTotal"), value: String(summary.total), sub: null as string | null },
    { label: t("leads.statVerified"), value: String(summary.verified), sub: pct(summary.verified, summary.total) },
    { label: t("leads.statCompleted"), value: String(summary.completed), sub: pct(summary.completed, summary.total) },
    { label: t("leads.statConverted"), value: String(summary.converted), sub: pct(summary.converted, summary.total) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("leads.subtitle")}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {search || tier !== "all" || status !== "all" || source !== "all" || capture !== "all" || funnel !== "all"
            ? `${filtered.length} / `
            : ""}
          {t(rows.length === 1 ? "leads.countOne" : "leads.countOther", { count: rows.length })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statTiles.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface-1 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-bold">{s.value}</span>
              {s.sub && <span className="text-sm text-muted-foreground">{s.sub}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.bySource")}</span>
          {summary.bySource.map((b) => (
            <span key={b.source ?? "organic"} className="text-muted-foreground">
              {sourceLabel(b.source)} <span className="font-medium text-foreground">{b.count}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.byCohort")}</span>
          {summary.byCohort.map((b) => (
            <span key={b.cohort ?? "none"} className="text-muted-foreground">
              {cohortShort(b.cohort)} <span className="font-medium text-foreground">{b.count}</span>
            </span>
          ))}
        </div>
        {dripDist.total > 0 && (
          <div className="flex flex-wrap items-center gap-2" title={t("leads.byDripStepHint")}>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.byDripStep")}</span>
            {dripDist.steps.map((s) => (
              <span key={s.step} className="text-muted-foreground">
                {t("leads.dripStepShort", { step: s.step })}{" "}
                <span className="font-medium text-foreground">{s.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("leads.searchPlaceholder")}
          className="min-h-[44px] w-full max-w-xs rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as "all" | LeadTier)}
          className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
        >
          <option value="all">{t("leads.filterTier")}</option>
          <option value="customer">{t("leads.tier_customer")}</option>
          <option value="hot">{t("leads.tier_hot")}</option>
          <option value="nurture">{t("leads.tier_nurture")}</option>
          <option value="suppressed">{t("leads.tier_suppressed")}</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
        >
          <option value="all">{t("leads.filterStatus")}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(`leads.status_${s}`, { defaultValue: s })}
            </option>
          ))}
        </select>
        {summary.bySource.length > 1 && (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
          >
            <option value="all">{t("leads.filterSource")}</option>
            {summary.bySource.map((b) => (
              <option key={b.source ?? "organic"} value={b.source ?? "__organic__"}>
                {sourceLabel(b.source)}
              </option>
            ))}
          </select>
        )}
        {hasExitIntent && (
          <select
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
          >
            <option value="all">{t("leads.filterCapture")}</option>
            <option value="quiz">{t("leads.capture_quiz")}</option>
            <option value="exit_intent">{t("leads.capture_exit_intent")}</option>
          </select>
        )}
        {hasFlashcards && (
          <select
            value={funnel}
            onChange={(e) => setFunnel(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
          >
            <option value="all">{t("leads.filterFunnel")}</option>
            <option value="simulado-honesto">{t("leads.funnel_quiz")}</option>
            <option value="flashcards-50">{t("leads.funnel_flashcards")}</option>
          </select>
        )}
        <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm cursor-pointer hover:bg-surface-2/50 min-h-[44px] sm:min-h-0">
          <input
            type="checkbox"
            checked={showTests}
            onChange={(e) => setShowTests(e.target.checked)}
            className="w-4 h-4"
          />
          <span>{t("leads.filterShowTests")}</span>
        </label>
        {hasArchived && (
          <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm cursor-pointer hover:bg-surface-2/50 min-h-[44px] sm:min-h-0">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4"
            />
            <span>{t("leads.filterShowArchived")}</span>
          </label>
        )}
        <button
          onClick={() => {
            const csv = generateLeadsCSV(filtered);
            const now = new Date();
            const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
            downloadCSV(csv, `leads-export-${dateStr}.csv`);
          }}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm hover:bg-surface-2/50 transition-colors min-h-[44px] sm:min-h-0"
          title={t("leads.exportCSVHint")}
        >
          <Download className="h-4 w-4" />
          <span>{t("leads.exportCSV")}</span>
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("leads.tierLegend")}</p>
        {rows.length >= 1000 && (
          <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {t("leads.paginationWarning", { count: rows.length })}
          </p>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4"
                  title={t("leads.selectAllCheckboxLabel")}
                />
              </th>
              <th className="px-4 py-3">{renderSortableHeader(t("leads.colLead"), "email")}</th>
              <th className="px-4 py-3">{renderSortableHeader(t("leads.colTier"), "tier")}</th>
              <th className="px-4 py-3">{t("leads.colProgress")}</th>
              <th className="px-4 py-3">{renderSortableHeader(t("leads.colDrip"), "dripStep")}</th>
              <th className="px-4 py-3">{t("leads.colEmailEngagement")}</th>
              <th className="px-4 py-3">{t("leads.colCohort")}</th>
              <th className="px-4 py-3">{t("leads.colSource")}</th>
              <th className="px-4 py-3">{t("leads.colStatus")}</th>
              <th className="px-4 py-3">
                {renderSortableHeader(t("leads.colLastActivity"), "lastActivity")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                  {t("leads.noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="cursor-pointer border-b border-border/50 hover:bg-surface-2/50">
                  <td className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => handleRowToggle(row.id)}
                      className="w-4 h-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <LeadIdentity row={row} />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <TierPill row={row} />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <Progress row={row} />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <DripStep row={row} />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <EmailEngagement row={row} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(row)}>
                    {cohortShort(row.targetCohort)}
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <span className="whitespace-nowrap text-sm">
                      {sourceLabel(row.utmSource)}
                      {row.utmCampaign && <span className="text-muted-foreground"> · {row.utmCampaign}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <StatusPill row={row} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm cursor-pointer" onClick={() => setSelected(row)}>
                    {fmtDate(row.lastEmailedAt ?? row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("leads.noResults")}
          </p>
        ) : (
          filtered.map((row) => (
            <div key={row.id} className="w-full space-y-3 rounded-xl border border-border bg-surface-1 p-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => handleRowToggle(row.id)}
                    className="w-4 h-4 mt-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div role="button" tabIndex={0} onClick={() => setSelected(row)} className="flex-1 cursor-pointer">
                    <LeadIdentity row={row} />
                  </div>
                </div>
                <TierPill row={row} />
              </div>
              <Progress row={row} />
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelected(row)}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground cursor-pointer"
              >
                <span>
                  {cohortShort(row.targetCohort)} · {sourceLabel(row.utmSource)} ·{" "}
                  {t("leads.colDripFormat", { step: row.dripStep, total: 6 })}
                </span>
                <div className="flex items-center gap-2">
                  <StatusPill row={row} />
                  <span>{fmtDate(row.createdAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <LeadDetailDrawer
        key={selected?.id ?? "none"}
        row={selected}
        onClose={() => setSelected(null)}
      />

      <BulkAssignCohortModal
        isOpen={showCohortModal}
        onClose={() => setShowCohortModal(false)}
        selectedCount={selectedIds.size}
        onConfirm={handleBulkAssignCohort}
      />

      <BulkResendModal
        isOpen={showResendModal}
        onClose={() => setShowResendModal(false)}
        selectedCount={selectedIds.size}
        onConfirm={handleBulkResendEmail}
      />

      <ConfirmModal
        open={confirmAction !== null}
        title={t(
          confirmAction === "reactivate" ? "leads.bulkReactivateTitle" : "leads.bulkUnsubscribeTitle",
        )}
        description={
          <p>
            {t(
              confirmAction === "reactivate"
                ? selectedIds.size === 1
                  ? "leads.bulkReactivateDescriptionOne"
                  : "leads.bulkReactivateDescriptionOther"
                : selectedIds.size === 1
                  ? "leads.bulkUnsubscribeDescriptionOne"
                  : "leads.bulkUnsubscribeDescriptionOther",
              { count: selectedIds.size },
            )}
          </p>
        }
        confirmLabel={t(
          confirmAction === "reactivate" ? "leads.bulkReactivateConfirm" : "leads.bulkUnsubscribeConfirm",
        )}
        destructive={confirmAction === "unsubscribe"}
        isPending={isProcessing}
        onConfirm={() => confirmAction && handleBulkDripStatus(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface-1 px-4 py-3 shadow-lg z-40">
          <div className="mx-auto max-w-6xl space-y-2">
            {(successMessage || errorMessage) && (
              <p className="text-sm">
                {successMessage && (
                  <span className="text-green-600 dark:text-green-400">{successMessage}</span>
                )}
                {errorMessage && (
                  <span className="text-red-600 dark:text-red-400">{errorMessage}</span>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span className="text-sm font-medium">
                {t(
                  selectedIds.size === 1
                    ? "leads.bulkSelectedCount"
                    : "leads.bulkSelectedCountOther",
                  { count: selectedIds.size },
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setMoreMenuOpen((v) => !v)}
                    disabled={isProcessing}
                    aria-haspopup="menu"
                    aria-expanded={moreMenuOpen}
                    aria-label={t("leads.bulkMore")}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium hover:bg-surface-2/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">{t("leads.bulkMore")}</span>
                  </button>
                  {moreMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMoreMenuOpen(false)}
                      />
                      <div
                        role="menu"
                        className="absolute bottom-full left-0 z-50 mb-2 w-60 rounded-xl border border-border bg-surface-1 p-1 shadow-lg"
                      >
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setConfirmAction("unsubscribe");
                          }}
                          disabled={!canUnsubscribe}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <MailX className="h-4 w-4 text-muted-foreground" />
                          {t("leads.bulkUnsubscribe")}
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setConfirmAction("reactivate");
                          }}
                          disabled={!canReactivate}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <MailCheck className="h-4 w-4 text-muted-foreground" />
                          {t("leads.bulkReactivate")}
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            handleBulkArchive(true);
                          }}
                          disabled={!canArchive}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Archive className="h-4 w-4 text-muted-foreground" />
                          {t("leads.bulkArchive")}
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            handleBulkArchive(false);
                          }}
                          disabled={!canUnarchive}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArchiveRestore className="h-4 w-4 text-muted-foreground" />
                          {t("leads.bulkUnarchive")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setShowCohortModal(true)}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand/30 px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("leads.bulkAssignCohort")}
                </button>
                <button
                  onClick={() => setShowResendModal(true)}
                  disabled={isProcessing || !canResendEmail}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand/30 px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title={!canResendEmail ? t("leads.bulkResendDisabledTooltip") : ""}
                >
                  <Mail className="h-4 w-4" />
                  {t("leads.bulkResend")}
                </button>
                <button
                  onClick={handleBulkMarkAsTest}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 min-h-[44px] sm:min-h-0 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </>
                  ) : (
                    t("leads.bulkMarkAsTest")
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}