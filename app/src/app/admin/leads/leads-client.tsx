"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { CheckCircle2 } from "lucide-react";
import type { LeadRow, LeadsSummary, LeadTier } from "@/lib/admin/leads";

interface Props {
  rows: LeadRow[];
  summary: LeadsSummary;
}

const tierColor: Record<LeadTier, string> = {
  hot: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  nurture: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  suppressed: "bg-surface-2 text-muted-foreground",
};

const statusColor: Record<string, string> = {
  active: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  converted: "bg-green-500/15 text-green-700 dark:text-green-400",
  unsubscribed: "bg-surface-2 text-muted-foreground",
  bounced: "bg-red-500/15 text-red-600 dark:text-red-400",
};

// "revalida-2026-2" → "2026.2" for a compact column. null (lead never reached the
// post-Q15 cohort picker) → "—" instead of a misleading default turma.
function cohortShort(slug: string | null): string {
  if (!slug) return "—";
  const m = slug.match(/(\d{4})-(\d)$/);
  return m ? `${m[1]}.${m[2]}` : slug;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export function LeadsClient({ rows, summary }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "en" ? "en-US" : "pt-BR";

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<"all" | LeadTier>("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");

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
    return rows.filter((r) => {
      if (tier !== "all" && r.tier !== tier) return false;
      if (status !== "all" && r.dripStatus !== status) return false;
      if (source !== "all" && (r.utmSource ?? "__organic__") !== source) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        (r.firstName ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, tier, status, source]);

  const statuses = useMemo(
    () => [...new Set(rows.map((r) => r.dripStatus))],
    [rows],
  );

  // ── Shared cell renderers (desktop table + mobile cards) ──────────────────

  function TierPill({ row }: { row: LeadRow }) {
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierColor[row.tier]}`}
      >
        {t(`leads.tier_${row.tier}`)}
      </span>
    );
  }

  function StatusPill({ row }: { row: LeadRow }) {
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          statusColor[row.dripStatus] ?? statusColor.active
        }`}
      >
        {t(`leads.status_${row.dripStatus}`, { defaultValue: row.dripStatus })}
      </span>
    );
  }

  function LeadIdentity({ row }: { row: LeadRow }) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="truncate">
            {row.firstName || row.email.split("@")[0]}
          </span>
          {row.verified && (
            <CheckCircle2
              className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
              aria-label={t("leads.verified")}
            />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
      </div>
    );
  }

  function Progress({ row }: { row: LeadRow }) {
    const answered = row.questionsAnswered ?? 0;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
          <span className={row.completed ? "font-medium" : "text-muted-foreground"}>
            {answered}/15
          </span>
          {row.score != null && (
            <span className="text-xs text-muted-foreground">
              · {t("leads.scoreShort", { score: row.score })}
            </span>
          )}
        </div>
        {row.weakSpecialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {row.weakSpecialties.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {s}
              </span>
            ))}
            {row.weakSpecialties.length > 3 && (
              <span className="px-1 py-0.5 text-xs text-muted-foreground">
                +{row.weakSpecialties.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  const statTiles = [
    { label: t("leads.statTotal"), value: String(summary.total), sub: null as string | null },
    {
      label: t("leads.statVerified"),
      value: String(summary.verified),
      sub: pct(summary.verified, summary.total),
    },
    {
      label: t("leads.statCompleted"),
      value: String(summary.completed),
      sub: pct(summary.completed, summary.total),
    },
    {
      label: t("leads.statConverted"),
      value: String(summary.converted),
      sub: pct(summary.converted, summary.total),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("leads.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("leads.subtitle")}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          {search || tier !== "all" || status !== "all" || source !== "all"
            ? `${filtered.length} / `
            : ""}
          {t(rows.length === 1 ? "leads.countOne" : "leads.countOther", {
            count: rows.length,
          })}
        </span>
      </div>

      {/* Summary tiles */}
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

      {/* Breakdown chips */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("leads.bySource")}
          </span>
          {summary.bySource.map((b) => (
            <span key={b.source ?? "organic"} className="text-muted-foreground">
              {sourceLabel(b.source)} <span className="font-medium text-foreground">{b.count}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("leads.byCohort")}
          </span>
          {summary.byCohort.map((b) => (
            <span key={b.cohort ?? "none"} className="text-muted-foreground">
              {cohortShort(b.cohort)}{" "}
              <span className="font-medium text-foreground">{b.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
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
      </div>

      <p className="text-xs text-muted-foreground">{t("leads.tierLegend")}</p>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{t("leads.colLead")}</th>
              <th className="px-4 py-3">{t("leads.colTier")}</th>
              <th className="px-4 py-3">{t("leads.colProgress")}</th>
              <th className="px-4 py-3">{t("leads.colCohort")}</th>
              <th className="px-4 py-3">{t("leads.colSource")}</th>
              <th className="px-4 py-3">{t("leads.colStatus")}</th>
              <th className="px-4 py-3">{t("leads.colCreated")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t("leads.noResults")}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-surface-2/50">
                  <td className="px-4 py-3"><LeadIdentity row={row} /></td>
                  <td className="px-4 py-3"><TierPill row={row} /></td>
                  <td className="px-4 py-3"><Progress row={row} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">{cohortShort(row.targetCohort)}</td>
                  <td className="px-4 py-3">
                    <span className="whitespace-nowrap">{sourceLabel(row.utmSource)}</span>
                    {row.utmCampaign && (
                      <p className="truncate text-xs text-muted-foreground">{row.utmCampaign}</p>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusPill row={row} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {fmtDate(row.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("leads.noResults")}
          </p>
        ) : (
          filtered.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <LeadIdentity row={row} />
                <TierPill row={row} />
              </div>
              <Progress row={row} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3 text-xs text-muted-foreground">
                <span>{cohortShort(row.targetCohort)} · {sourceLabel(row.utmSource)}</span>
                <div className="flex items-center gap-2">
                  <StatusPill row={row} />
                  <span>{fmtDate(row.createdAt)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
