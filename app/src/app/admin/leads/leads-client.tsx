"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { LeadRow, LeadTier } from "@/lib/admin/leads";
import type { FunnelEventDay } from "@/lib/admin/funnel";
import { FunnelPanel, type FunnelStageDatum, type FunnelBySourceRow } from "./funnel-panel";
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
  funnelEvents: FunnelEventDay[];
}

interface SortState {
  sortBy: "created" | "lastActivity" | "dripStep" | "tier" | "email" | null;
  sortAsc: boolean;
}

// A funnel-stage / attention chip the table is currently narrowed to. Stage
// keys match FunnelPanel's stage keys so one click handler serves both.
type FocusKey =
  | "email"
  | "completed"
  | "verified"
  | "purchased"
  | "saved"
  | "unverified48"
  | "bounced"
  | "drip_done";

type RangeKey = "7d" | "30d" | "all";
const RANGE_MS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

const KNOWN_FUNNELS = ["simulado-honesto", "flashcards-50", "simulado-100"] as const;

// Local YYYY-MM-DD (sparkline buckets by the admin's wall-clock day).
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function matchesFocus(r: LeadRow, focus: FocusKey, now: number): boolean {
  switch (focus) {
    case "email":
      return r.captureSource !== "exit_intent";
    case "completed":
      return r.completed;
    case "verified":
      return r.verified;
    case "purchased":
      return Boolean(r.convertedAt);
    case "saved":
      return r.captureSource === "exit_intent";
    case "unverified48":
      return (
        effectiveStatus(r) === "unverified" &&
        !r.convertedAt &&
        now - new Date(r.createdAt).getTime() > 48 * 3_600_000
      );
    case "bounced":
      return r.dripStatus === "bounced";
    case "drip_done":
      return r.dripStatus === "active" && r.verified && r.dripStep >= 6 && !r.convertedAt;
  }
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

export function LeadsClient({ rows, funnelEvents }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"all" | LeadTier>("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [capture, setCapture] = useState("all");
  // Page-level scopes — these narrow EVERY number on the page (funnel bars,
  // tiles, chips, table) identically, so nothing can disagree.
  const [qaMode, setQaMode] = useState(false); // include is_test rows everywhere
  const [range, setRange] = useState<RangeKey>("all");
  const [tab, setTab] = useState<string>("all"); // funnel tab ('all' | lead.source)
  const [focus, setFocus] = useState<FocusKey | null>(null); // stage/attention table filter
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

  // Funnels that actually have leads (drives the tab row; hidden when only one).
  const funnelsPresent = useMemo(() => {
    const present = new Set(rows.filter((r) => qaMode || !r.isTest).map((r) => r.source));
    return KNOWN_FUNNELS.filter((f) => present.has(f));
  }, [rows, qaMode]);

  // If the selected tab's funnel vanishes (e.g. QA off hides its only leads),
  // fall back to 'all' without needing an effect.
  const effectiveTab =
    tab === "all" || (funnelsPresent as readonly string[]).includes(tab) ? tab : "all";

  // Render must not call the impure Date.now(); day/hour granularity makes a
  // mount-time stamp fine (same pattern as member-detail-drawer).
  const [mountedAt] = useState(() => Date.now());

  const rangeCutoff = range === "all" ? null : mountedAt - RANGE_MS[range];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = mountedAt;
    const results = rows.filter((r) => {
      if (!qaMode && r.isTest) return false;
      if (!showArchived && r.isArchived) return false;
      if (effectiveTab !== "all" && r.source !== effectiveTab) return false;
      if (rangeCutoff !== null && new Date(r.createdAt).getTime() < rangeCutoff) return false;
      if (focus && !matchesFocus(r, focus, now)) return false;
      if (tier !== "all" && r.tier !== tier) return false;
      if (status !== "all" && effectiveStatus(r) !== status) return false;
      if (source !== "all" && (r.utmSource ?? "__organic__") !== source) return false;
      if (capture !== "all") {
        const cs = r.captureSource === "exit_intent" ? "exit_intent" : "quiz";
        if (cs !== capture) return false;
      }
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
  }, [rows, search, tier, status, source, capture, qaMode, showArchived, effectiveTab, rangeCutoff, focus, sort, mountedAt]);

  const hasExitIntent = useMemo(
    () => rows.some((r) => r.captureSource === "exit_intent"),
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
      if (r.source === "flashcards-50" || r.source === "simulado-100") continue;
      counts.set(r.dripStep, (counts.get(r.dripStep) ?? 0) + 1);
      total++;
    }
    const steps = [...counts.entries()]
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => a.step - b.step);
    return { steps, total };
  }, [rows]);

  // ── The one shared stat scope ────────────────────────────────────────────
  // Every headline number (funnel bars, tiles, chips) derives from statRows:
  // real leads (archived always out, tests out unless QA mode) within the
  // current funnel tab and date range. The table applies the SAME scope plus
  // its own narrowing filters, so stats and table can never disagree.
  const statRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (qaMode || !r.isTest) &&
          !r.isArchived &&
          (effectiveTab === "all" || r.source === effectiveTab) &&
          (rangeCutoff === null || new Date(r.createdAt).getTime() >= rangeCutoff),
      ),
    [rows, qaMode, effectiveTab, rangeCutoff],
  );

  const funnelStats = useMemo(() => {
    // 'landing'/'quiz_start' beacons only exist for the quiz funnel — on other
    // tabs they're simply not tracked (null). Internal events (team browsers,
    // test-lead sessions) follow the same rule as test leads: QA mode only.
    const eventsVisible = effectiveTab === "all" || effectiveTab === "simulado-honesto";
    let landed: number | null = null;
    let started: number | null = null;
    if (eventsVisible) {
      landed = 0;
      started = 0;
      const cutoffDay =
        rangeCutoff === null ? null : new Date(rangeCutoff).toISOString().slice(0, 10);
      for (const e of funnelEvents) {
        if (!qaMode && e.internal) continue;
        if (cutoffDay !== null && e.day < cutoffDay) continue;
        if (e.eventType === "landing") landed += e.count;
        else started += e.count;
      }
    }
    let email = 0;
    let saved = 0;
    let completed = 0;
    let verified = 0;
    let purchased = 0;
    for (const r of statRows) {
      if (r.captureSource === "exit_intent") saved++;
      else email++;
      if (r.completed) completed++;
      if (r.verified) verified++;
      if (r.convertedAt) purchased++;
    }
    return { landed, started, email, saved, completed, verified, purchased };
  }, [statRows, funnelEvents, effectiveTab, rangeCutoff, qaMode]);

  const funnelStages: FunnelStageDatum[] = useMemo(() => {
    const f = funnelStats;
    const defs: {
      key: string;
      count: number | null;
      prev: number | null;
      prevKey: string | null;
      clickable: boolean;
    }[] = [
      { key: "landed", count: f.landed, prev: null, prevKey: null, clickable: false },
      { key: "started", count: f.started, prev: f.landed, prevKey: "landed", clickable: false },
      { key: "email", count: f.email, prev: f.started, prevKey: "started", clickable: true },
      { key: "completed", count: f.completed, prev: f.email, prevKey: "email", clickable: true },
      { key: "verified", count: f.verified, prev: f.completed, prevKey: "completed", clickable: true },
      { key: "purchased", count: f.purchased, prev: f.verified, prevKey: "verified", clickable: true },
    ];
    return defs.map((d) => {
      const showPct = d.count !== null && d.prev !== null && d.prev > 0 && d.prevKey !== null;
      return {
        key: d.key,
        label: t(`funnel.stage_${d.key}`),
        count: d.count,
        sub: showPct
          ? t("funnel.ofPrev", {
              pct: `${Math.round(((d.count as number) / (d.prev as number)) * 100)}%`,
              prev: t(`funnel.stage_${d.prevKey}`),
            })
          : null,
        clickable: d.clickable,
        active: focus === d.key,
      };
    });
  }, [funnelStats, focus, t]);

  // Overall visit→sale. "—" until there's a real sale (0% reads as broken).
  const overallValue = useMemo(() => {
    const { landed, purchased } = funnelStats;
    if (!landed || !purchased) return "—";
    const p = (purchased / landed) * 100;
    return p >= 1 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
  }, [funnelStats]);

  const funnelBySource: FunnelBySourceRow[] = useMemo(() => {
    const eventsVisible = effectiveTab === "all" || effectiveTab === "simulado-honesto";
    const cutoffDay =
      rangeCutoff === null ? null : new Date(rangeCutoff).toISOString().slice(0, 10);
    const map = new Map<string, FunnelBySourceRow>();
    const rowFor = (src: string | null): FunnelBySourceRow => {
      const k = src ?? "";
      let r = map.get(k);
      if (!r) {
        r = {
          source: src,
          landed: eventsVisible ? 0 : null,
          started: eventsVisible ? 0 : null,
          email: 0,
          completed: 0,
          verified: 0,
          purchased: 0,
        };
        map.set(k, r);
      }
      return r;
    };
    if (eventsVisible) {
      for (const e of funnelEvents) {
        if (!qaMode && e.internal) continue;
        if (cutoffDay !== null && e.day < cutoffDay) continue;
        const r = rowFor(e.source);
        if (e.eventType === "landing") r.landed = (r.landed ?? 0) + e.count;
        else r.started = (r.started ?? 0) + e.count;
      }
    }
    for (const l of statRows) {
      const r = rowFor(l.utmSource);
      if (l.captureSource !== "exit_intent") r.email++;
      if (l.completed) r.completed++;
      if (l.verified) r.verified++;
      if (l.convertedAt) r.purchased++;
    }
    return [...map.values()].sort(
      (a, b) => Math.max(b.landed ?? 0, b.email) - Math.max(a.landed ?? 0, a.email),
    );
  }, [statRows, funnelEvents, effectiveTab, rangeCutoff, qaMode]);

  const funnelIsEmpty =
    (funnelStats.landed ?? 0) === 0 &&
    (funnelStats.started ?? 0) === 0 &&
    funnelStats.email === 0 &&
    funnelStats.saved === 0;

  const byCohortCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const r of statRows) m.set(r.targetCohort, (m.get(r.targetCohort) ?? 0) + 1);
    return [...m.entries()]
      .map(([cohort, count]) => ({ cohort, count }))
      .sort((a, b) => b.count - a.count);
  }, [statRows]);

  const bySourceCounts = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const r of statRows) m.set(r.utmSource, (m.get(r.utmSource) ?? 0) + 1);
    return [...m.entries()]
      .map(([src, count]) => ({ source: src, count }))
      .sort((a, b) => b.count - a.count);
  }, [statRows]);

  // New real leads per local day, fixed last-14-days window (ignores the range
  // switcher — it IS a time view; respects QA mode and the funnel tab).
  const spark = useMemo(() => {
    const days: { key: string; label: string; count: number }[] = [];
    const now = new Date(mountedAt);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({
        key: localDayKey(d),
        label: d.toLocaleDateString(dateLocale, { day: "2-digit", month: "short" }),
        count: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const r of rows) {
      if (!(qaMode || !r.isTest) || r.isArchived) continue;
      if (effectiveTab !== "all" && r.source !== effectiveTab) continue;
      const i = idx.get(localDayKey(new Date(r.createdAt)));
      if (i !== undefined) days[i].count++;
    }
    return days;
  }, [rows, qaMode, effectiveTab, dateLocale, mountedAt]);

  // Actionable to-dos — always REAL leads only (a QA signup is never a to-do),
  // and always all-time/all-funnels: clicking one resets range+tab so the
  // table shows exactly the counted leads.
  const attention = useMemo(() => {
    const now = mountedAt;
    let unverified48 = 0;
    let bounced = 0;
    let dripDone = 0;
    for (const r of rows) {
      if (r.isTest || r.isArchived) continue;
      if (matchesFocus(r, "unverified48", now)) unverified48++;
      if (matchesFocus(r, "bounced", now)) bounced++;
      if (matchesFocus(r, "drip_done", now)) dripDone++;
    }
    return { unverified48, bounced, dripDone };
  }, [rows, mountedAt]);

  const focusLabel =
    focus === null
      ? null
      : focus === "saved"
        ? t("leads.focusSaved")
        : focus === "unverified48"
          ? t("leads.focusUnverified48")
          : focus === "bounced"
            ? t("leads.focusBounced")
            : focus === "drip_done"
              ? t("leads.focusDripDone")
              : t(`funnel.stage_${focus}`);

  const toggleFocus = (key: string) =>
    setFocus((f) => (f === key ? null : (key as FocusKey)));

  const focusAttention = (key: FocusKey) => {
    setFocus((f) => (f === key ? null : key));
    // The strip counts globally — widen the page scope so counts match the table.
    setRange("all");
    setTab("all");
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const selectedRows = useMemo(
    () => filtered.filter((r) => selectedIds.has(r.id)),
    [filtered, selectedIds],
  );

  const canResendEmail = useMemo(() => {
    if (selectedRows.length === 0) return false;
    // Flashcards/simulado-funnel leads have their own sequences (lead-fc-* /
    // lead-sim-*) — the quiz templates would be wrong for them.
    return selectedRows.every(
      (r) =>
        r.dripStatus === "active" &&
        r.source !== "flashcards-50" &&
        r.source !== "simulado-100",
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

  // Turma cell. A reassigned lead (retired turma / bulk-assign) keeps its ORIGINAL
  // choice visible — "2026.2 → 2027.1" — so the panel never misreports what the
  // lead actually picked. previousTargetCohort is null when never reassigned.
  function CohortCell({ row }: { row: LeadRow }) {
    if (!row.previousTargetCohort || row.previousTargetCohort === row.targetCohort) {
      return <>{cohortShort(row.targetCohort)}</>;
    }
    return (
      <span
        className="whitespace-nowrap"
        title={t("leads.cohortReassigned", {
          from: cohortShort(row.previousTargetCohort),
          to: cohortShort(row.targetCohort),
        })}
      >
        <span className="text-muted-foreground">{cohortShort(row.previousTargetCohort)} →</span>{" "}
        {cohortShort(row.targetCohort)}
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
    if (row.source === "simulado-100") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-300">
          <span aria-hidden>📝</span>
          {t("leads.funnel_simulado")}
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

  const headlineTotal = funnelStats.email + funnelStats.saved;
  const sparkTotal = spark.reduce((s, d) => s + d.count, 0);
  const sparkMax = Math.max(1, ...spark.map((d) => d.count));
  const anyNarrowing =
    Boolean(search) ||
    tier !== "all" ||
    status !== "all" ||
    source !== "all" ||
    capture !== "all" ||
    focus !== null;
  // What the table shows with no narrowing filters — the corner count must
  // match it exactly (the old raw-row count was the "29 leads" confusion).
  const baseCount = rows.filter(
    (r) =>
      (qaMode || !r.isTest) &&
      (showArchived || !r.isArchived) &&
      (effectiveTab === "all" || r.source === effectiveTab) &&
      (rangeCutoff === null || new Date(r.createdAt).getTime() >= rangeCutoff),
  ).length;

  const funnelTabLabel = (f: string) =>
    f === "simulado-honesto"
      ? t("leads.funnel_quiz")
      : f === "flashcards-50"
        ? t("leads.funnel_flashcards")
        : t("leads.funnel_simulado");

  const scopeBtn = (active: boolean) =>
    `min-h-[44px] rounded-md px-3 py-1.5 text-sm transition-colors sm:min-h-0 ${
      active ? "bg-brand font-medium text-brand-fg" : "text-muted-foreground hover:text-foreground"
    }`;

  const attnChip = (active: boolean) =>
    `inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 ${
      active
        ? "border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-200"
        : "border-amber-500/20 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
    }`;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("leads.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {anyNarrowing ? `${filtered.length} / ` : ""}
            {t(baseCount === 1 ? "leads.countOne" : "leads.countOther", { count: baseCount })}
          </span>
          <label
            className="flex min-h-[44px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm hover:bg-surface-2/50 sm:min-h-0"
            title={t("leads.qaModeHint")}
          >
            <input
              type="checkbox"
              checked={qaMode}
              onChange={(e) => setQaMode(e.target.checked)}
              className="h-4 w-4"
            />
            <span>{t("leads.qaMode")}</span>
          </label>
        </div>
      </div>

      {qaMode && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("leads.qaModeBanner")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {funnelsPresent.length > 1 ? (
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5">
            {["all", ...funnelsPresent].map((f) => (
              <button key={f} type="button" onClick={() => setTab(f)} className={scopeBtn(effectiveTab === f)}>
                {f === "all" ? t("leads.tabAll") : funnelTabLabel(f)}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="inline-flex gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5">
          {(["7d", "30d", "all"] as const).map((rk) => (
            <button key={rk} type="button" onClick={() => setRange(rk)} className={scopeBtn(range === rk)}>
              {t(`leads.range_${rk}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-1 p-4" title={t("leads.statTotalHint")}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.statTotal")}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{headlineTotal}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4" title={t("leads.statVerifiedHint")}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.statVerified")}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums">{funnelStats.verified}</span>
            <span className="text-sm text-muted-foreground">{pct(funnelStats.verified, headlineTotal)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-1 p-4" title={t("leads.statConvertedHint")}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.statConverted")}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums">{funnelStats.purchased}</span>
            <span className="text-sm text-muted-foreground">{pct(funnelStats.purchased, headlineTotal)}</span>
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-border bg-surface-1 p-4 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.headlineTrend")}</p>
            <span className="text-sm font-semibold tabular-nums">{sparkTotal}</span>
          </div>
          <div
            className="mt-2 flex h-10 items-end gap-[2px]"
            role="img"
            aria-label={spark.map((d) => `${d.label}: ${d.count}`).join(", ")}
          >
            {spark.map((d) => (
              <div
                key={d.key}
                title={`${d.label}: ${d.count}`}
                className={`flex-1 rounded-sm ${d.count > 0 ? "bg-brand" : "bg-surface-2"}`}
                style={{ height: d.count > 0 ? `${Math.max(15, (d.count / sparkMax) * 100)}%` : "3px" }}
              />
            ))}
          </div>
        </div>
      </div>

      <FunnelPanel
        stages={funnelStages}
        savedForLater={funnelStats.saved}
        savedNote={t(funnelStats.saved === 1 ? "funnel.savedNoteOne" : "funnel.savedNoteOther", {
          count: funnelStats.saved,
        })}
        savedActive={focus === "saved"}
        overallValue={overallValue}
        onStageClick={toggleFocus}
        bySource={funnelBySource}
        showNotTrackedNote={effectiveTab !== "all" && effectiveTab !== "simulado-honesto"}
        isEmpty={funnelIsEmpty}
      />

      {(attention.unverified48 > 0 || attention.bounced > 0 || attention.dripDone > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("leads.attentionTitle")}
          </span>
          {attention.unverified48 > 0 && (
            <button
              type="button"
              onClick={() => focusAttention("unverified48")}
              aria-pressed={focus === "unverified48"}
              className={attnChip(focus === "unverified48")}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {t(
                attention.unverified48 === 1
                  ? "leads.attentionUnverifiedOne"
                  : "leads.attentionUnverifiedOther",
                { count: attention.unverified48 },
              )}
            </button>
          )}
          {attention.bounced > 0 && (
            <button
              type="button"
              onClick={() => focusAttention("bounced")}
              aria-pressed={focus === "bounced"}
              className={attnChip(focus === "bounced")}
            >
              <MailX className="h-3.5 w-3.5" />
              {t(attention.bounced === 1 ? "leads.attentionBouncedOne" : "leads.attentionBouncedOther", {
                count: attention.bounced,
              })}
            </button>
          )}
          {attention.dripDone > 0 && (
            <button
              type="button"
              onClick={() => focusAttention("drip_done")}
              aria-pressed={focus === "drip_done"}
              className={attnChip(focus === "drip_done")}
            >
              <Mail className="h-3.5 w-3.5" />
              {t(
                attention.dripDone === 1 ? "leads.attentionDripDoneOne" : "leads.attentionDripDoneOther",
                { count: attention.dripDone },
              )}
            </button>
          )}
        </div>
      )}

      {focus && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("leads.focusShowing")}</span>
          <span className="font-medium">{focusLabel}</span>
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1 font-medium text-brand hover:underline sm:min-h-0"
          >
            <X className="h-3.5 w-3.5" />
            {t("leads.focusClear")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.bySource")}</span>
          {bySourceCounts.map((b) => (
            <span key={b.source ?? "organic"} className="text-muted-foreground">
              {sourceLabel(b.source)} <span className="font-medium text-foreground">{b.count}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("leads.byCohort")}</span>
          {byCohortCounts.map((b) => (
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
        {bySourceCounts.length > 1 && (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-brand/50 sm:min-h-0"
          >
            <option value="all">{t("leads.filterSource")}</option>
            {bySourceCounts.map((b) => (
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
              <th className="px-2 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4"
                  title={t("leads.selectAllCheckboxLabel")}
                />
              </th>
              <th className="px-3 py-3">{renderSortableHeader(t("leads.colLead"), "email")}</th>
              <th className="px-3 py-3">{renderSortableHeader(t("leads.colTier"), "tier")}</th>
              <th className="px-3 py-3">{t("leads.colProgress")}</th>
              <th className="hidden lg:table-cell px-3 py-3">
                {renderSortableHeader(t("leads.colDrip"), "dripStep")}
              </th>
              <th className="hidden xl:table-cell px-3 py-3">{t("leads.colEmailEngagement")}</th>
              <th className="hidden xl:table-cell px-3 py-3">{t("leads.colCohort")}</th>
              <th className="hidden 2xl:table-cell px-3 py-3">{t("leads.colSource")}</th>
              <th className="px-3 py-3">{t("leads.colStatus")}</th>
              <th className="px-3 py-3">
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
                  <td className="px-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => handleRowToggle(row.id)}
                      className="w-4 h-4"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <LeadIdentity row={row} />
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <TierPill row={row} />
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <Progress row={row} />
                  </td>
                  <td className="hidden lg:table-cell px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <DripStep row={row} />
                  </td>
                  <td className="hidden xl:table-cell px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <EmailEngagement row={row} />
                  </td>
                  <td className="hidden xl:table-cell px-3 py-3 whitespace-nowrap cursor-pointer" onClick={() => setSelected(row)}>
                    <CohortCell row={row} />
                  </td>
                  <td className="hidden 2xl:table-cell px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <span className="whitespace-nowrap text-sm">
                      {sourceLabel(row.utmSource)}
                      {row.utmCampaign && <span className="text-muted-foreground"> · {row.utmCampaign}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-3 cursor-pointer" onClick={() => setSelected(row)}>
                    <StatusPill row={row} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground text-sm cursor-pointer" onClick={() => setSelected(row)}>
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
                  <CohortCell row={row} /> · {sourceLabel(row.utmSource)} ·{" "}
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