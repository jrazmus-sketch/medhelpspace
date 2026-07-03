"use client";

import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import Link from "next/link";
import {
  LifeBuoy, FileText, Receipt, FileEdit, QrCode, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, GraduationCap, CalendarClock, Users, UserPlus,
  Activity, ChevronRight, History, BarChart3, Globe,
} from "lucide-react";
import type { DashboardData } from "@/lib/admin/dashboard-stats";
import type { AnalyticsStats } from "@/lib/admin/analytics-stats";

interface Props {
  data: DashboardData;
  analytics: AnalyticsStats | null;
  analyticsConfigured: boolean;
  displayName: string | null;
  canSeeBilling: boolean;
  canSeeSupport: boolean;
  canSeeAudit: boolean;
  canSeeAnalytics: boolean;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function brlShort(cents: number): string {
  const v = cents / 100;
  if (v >= 1000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return brl(cents);
}
function fmtDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "short",
  });
}
function relTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}sem`;
}

// ── Action Center ─────────────────────────────────────────────────────────────
type Tone = "brand" | "green" | "amber" | "red" | "muted";
const TONE: Record<Tone, string> = {
  brand: "border-brand/40 bg-brand/5 text-brand",
  green: "border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400",
  amber: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  red: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-400",
  muted: "border-border bg-surface-1 text-muted-foreground",
};

function ActionTile({
  href, icon: Icon, count, label, tone, note,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  tone: Tone;
  note?: string | null;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[88px] flex-col justify-between rounded-xl border p-3 transition-colors hover:brightness-105 ${TONE[tone]}`}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-80" />
        <span className="text-2xl font-bold leading-none">{count}</span>
      </div>
      <div>
        <p className="text-xs font-medium leading-tight">{label}</p>
        {note && <p className="mt-0.5 text-[10px] opacity-80">{note}</p>}
      </div>
    </Link>
  );
}

export function AdminDashboardClient({
  data, analytics, analyticsConfigured, displayName,
  canSeeBilling, canSeeSupport, canSeeAudit, canSeeAnalytics,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { content, actions, members, cohorts, revenue, recentActivity } = data;

  type Tile = { key: string; node: React.ReactNode };
  const tiles: Tile[] = [];
  if (canSeeSupport && actions.supportOpen > 0) {
    tiles.push({ key: "support", node: (
      <ActionTile href="/admin/suporte" icon={LifeBuoy} count={actions.supportOpen}
        label={t("dashboard.openTickets")} tone="brand" />
    )});
  }
  if (canSeeBilling && actions.nfseReady > 0) {
    tiles.push({ key: "nfse", node: (
      <ActionTile href="/admin/notas-fiscais" icon={Receipt} count={actions.nfseReady}
        label={t("dashboard.notasToIssue")}
        tone={actions.nfseAtRisk > 0 ? "red" : "green"}
        note={
          actions.nfseAtRisk > 0
            ? t("dashboard.notasAtRisk", { count: actions.nfseAtRisk })
            : actions.nfseOldestDays != null
              ? t("dashboard.oldestWaiting", { count: actions.nfseOldestDays })
              : null
        } />
    )});
  }
  if (actions.drafts > 0) {
    tiles.push({ key: "drafts", node: (
      <ActionTile href="/admin/pages?status=draft" icon={FileEdit} count={actions.drafts}
        label={t("dashboard.draftsToReview")} tone="amber" />
    )});
  }
  if (canSeeBilling && actions.pendingPix > 0) {
    tiles.push({ key: "pix", node: (
      <ActionTile href="/admin/billing" icon={QrCode} count={actions.pendingPix}
        label={t("dashboard.pendingPix")} tone="muted" />
    )});
  }
  if (canSeeBilling && actions.declined24h > 0) {
    tiles.push({ key: "declined", node: (
      <ActionTile href="/admin/billing" icon={AlertTriangle} count={actions.declined24h}
        label={t("dashboard.declined")} tone="red" />
    )});
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        {displayName && (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.greeting", { name: displayName })}
          </p>
        )}
      </div>

      {/* ── Zone 1 — Action Center ── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("dashboard.attention")}
        </h2>
        {tiles.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">{t("dashboard.allClear")}</p>
              <p className="text-xs opacity-80">{t("dashboard.allClearSub")}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {tiles.map((tile) => (
                <div key={tile.key}>{tile.node}</div>
              ))}
            </div>
            {/* Clickable recent open tickets → deep-link opens the thread */}
            {canSeeSupport && actions.recentTickets.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {actions.recentTickets.map((tk) => (
                  <li key={tk.id}>
                    <Link
                      href={`/admin/suporte?ticket=${tk.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-1"
                    >
                      {tk.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{tk.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {tk.who} · {relTime(tk.lastAt)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── Zone 2 — Revenue ── */}
      {canSeeBilling && revenue && (
        <section className="space-y-3">
          <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5" />
              {t("dashboard.revenue")}
            </span>
            <Link href="/admin/billing" className="inline-flex min-h-[44px] items-center text-xs font-medium text-brand hover:underline">
              {t("common.viewAll")} →
            </Link>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Headline + sparkline */}
            <div className="rounded-xl border border-border bg-surface-1 p-4 md:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("dashboard.thisMonth")}</p>
                  <p className="text-3xl font-bold text-foreground">{brl(revenue.monthCents)}</p>
                </div>
                {revenue.pctChange != null && (
                  <span
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      revenue.pctChange >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {revenue.pctChange >= 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {revenue.pctChange >= 0 ? "+" : ""}{revenue.pctChange}% {t("dashboard.vsLastMonth")}
                  </span>
                )}
              </div>
              {/* Sparkline */}
              <Sparkline series={revenue.series} />
              <p className="mt-1 text-[10px] text-muted-foreground">{t("dashboard.last30days")}</p>
            </div>
            {/* Stat column */}
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border">
              <MiniStat label={t("dashboard.salesMonth")} value={String(revenue.monthCount)}
                sub={`${revenue.todayCount} ${t("dashboard.today")} · ${revenue.weekCount} ${t("dashboard.week")}`} />
              <MiniStat label={t("dashboard.methodMix")}
                value={`${revenue.pixCount} / ${revenue.cardCount}`} sub={t("dashboard.pixCard")} />
              <MiniStat label={t("dashboard.avgOrder")} value={brl(revenue.avgOrderCents)}
                sub={`${t("dashboard.lifetime")}: ${brlShort(revenue.lifetimeCents)}`} />
            </div>
          </div>
          {/* Recent sales */}
          {revenue.recent.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <p className="border-b border-border bg-surface-1 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("dashboard.recentSales")}
              </p>
              <ul className="divide-y divide-border">
                {revenue.recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.cohort} · {relTime(s.at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">
                      {brl(s.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── Zone 2.5 — Acquisition (GA4, super_admin) ── */}
      {canSeeAnalytics && (
        <section className="space-y-3">
          <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5" />
              {t("dashboard.acquisition")}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/70">
                · {t("dashboard.last28days")}
              </span>
            </span>
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center text-xs font-medium text-brand hover:underline"
            >
              {t("dashboard.openGA")} →
            </a>
          </h2>

          {analytics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <TrafficStat label={t("dashboard.visitors")} value={analytics.totals.users} prev={analytics.totals.usersPrev} />
                <TrafficStat label={t("dashboard.sessions")} value={analytics.totals.sessions} prev={analytics.totals.sessionsPrev} />
                <TrafficStat label={t("dashboard.pageviews")} value={analytics.totals.views} prev={analytics.totals.viewsPrev} />
                <div className="rounded-xl border border-border bg-surface-1 p-4">
                  <p className="text-xs text-muted-foreground">{t("dashboard.engagement")}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{fmtDuration(analytics.totals.avgEngagementSec)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.newUsersN", { count: analytics.totals.newUsers })}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-surface-1 p-4">
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.visitors")} · {t("dashboard.last30days")}
                </p>
                <UsersSparkline series={analytics.sparkline} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <BreakdownList
                  title={t("dashboard.topChannels")}
                  icon={Globe}
                  rows={analytics.channels.map((c) => ({ label: c.name, value: c.sessions }))}
                  empty={t("dashboard.collectingData")}
                />
                <BreakdownList
                  title={t("dashboard.topLanding")}
                  icon={FileText}
                  rows={analytics.landingPages.map((p) => ({ label: p.path, value: p.sessions }))}
                  empty={t("dashboard.collectingData")}
                />
              </div>

              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
                <MiniStat label={t("dashboard.signupsConv")} value={analytics.conversions.signUps.toLocaleString("pt-BR")} />
                <MiniStat label={t("dashboard.purchasesConv")} value={analytics.conversions.purchases.toLocaleString("pt-BR")} />
                <MiniStat label={t("dashboard.gaRevenue")} value={brl(analytics.conversions.revenueCents)} />
              </div>
            </div>
          ) : analyticsConfigured ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.analyticsUnavailable")}
            </p>
          ) : (
            <div className="rounded-xl border border-dashed border-brand/40 bg-brand/5 px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">{t("dashboard.analyticsNotConnected")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.analyticsNotConnectedSub")}</p>
            </div>
          )}
        </section>
      )}

      {/* ── Zone 3 — Cohorts ── */}
      {cohorts.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" />
            {t("dashboard.cohorts")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {cohorts.map((c) => {
              const expiring =
                c.daysToMembershipEnd != null && c.daysToMembershipEnd >= 0 && c.daysToMembershipEnd <= 30;
              return (
                <Link
                  key={c.id}
                  href="/admin/cohorts"
                  className="group rounded-xl border border-border bg-surface-1 p-4 transition-colors hover:border-brand/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground group-hover:text-brand">{c.name}</p>
                    {c.daysToTest != null && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.daysToTest < 0
                            ? "bg-surface-2 text-muted-foreground"
                            : c.daysToTest <= 60
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-brand/10 text-brand"
                        }`}
                      >
                        {c.daysToTest < 0
                          ? t("dashboard.testPassed")
                          : t("dashboard.daysToTest", { count: c.daysToTest })}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {t("dashboard.studentsN", { count: c.members })}
                    </span>
                    {canSeeBilling && c.revenueCents > 0 && (
                      <span className="font-medium text-foreground">{brlShort(c.revenueCents)}</span>
                    )}
                    {c.daysTo60d != null && c.daysTo60d >= 0 && c.daysTo60d <= 30 && (
                      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {t("dashboard.unlock60d", { count: c.daysTo60d })}
                      </span>
                    )}
                  </div>
                  {expiring && (
                    <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                      {t("dashboard.accessEnds", { count: c.daysToMembershipEnd! })}
                    </p>
                  )}
                  {c.isForSale && c.saleEndsAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dashboard.saleEnds", { date: fmtDate(c.saleEndsAt, locale) })}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Zone 4 — Members ── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("dashboard.members")}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <BigStat icon={UserPlus} value={members.signups7d} label={t("dashboard.newSignups7")} />
          <BigStat icon={UserPlus} value={members.signups30d} label={t("dashboard.newSignups30")} />
          <BigStat icon={Activity} value={members.active7d} label={t("dashboard.active7")} />
          <BigStat icon={Activity} value={members.active30d} label={t("dashboard.active30")} />
        </div>
      </section>

      {/* ── Zone 5 — Library (compact strip) ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("dashboard.library")}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface-1 px-4 py-3 text-sm">
          <StripStat href="/admin/pages" n={content.pages} label={t("nav.pages")} />
          <StripStat href="/admin/lessons" n={content.lessons} label={t("nav.lessons")} />
          <StripStat href="/admin/quizzes" n={content.quizzes} label={t("nav.quizzes")} />
          <StripStat href="/admin/flashcards" n={content.flashcards} label={t("nav.flashcards")} />
          <StripStat href="/admin/members" n={content.members} label={t("nav.members")} />
          <StripStat href="/admin/cohorts" n={content.cohorts} label={t("nav.cohorts")} />
          <span className="ml-auto text-xs text-muted-foreground">
            {t("dashboard.audioCoverage")}:{" "}
            <span className="font-semibold text-foreground">
              {content.lessons > 0 ? Math.round((content.lessonsWithAudio / content.lessons) * 100) : 0}%
            </span>
          </span>
        </div>
      </section>

      {/* ── Zone 6 — Recent admin activity (super_admin) ── */}
      {canSeeAudit && recentActivity && (
        <section className="space-y-3">
          <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-2">
              <History className="h-3.5 w-3.5" />
              {t("dashboard.recentActivity")}
            </span>
            <Link href="/admin/audit-log" className="inline-flex min-h-[44px] items-center text-xs font-medium text-brand hover:underline">
              {t("common.viewAll")} →
            </Link>
          </h2>
          {recentActivity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.noActivity")}
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{a.actor}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>
                    {a.target && <span className="text-muted-foreground"> → {a.target}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{relTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; cents: number }[] }) {
  const max = Math.max(...series.map((s) => s.cents), 1);
  return (
    <div className="mt-4 flex h-12 items-end gap-0.5" aria-hidden="true">
      {series.map((s) => (
        <div
          key={s.day}
          className="flex-1 rounded-sm bg-brand/30"
          style={{ height: `${Math.max((s.cents / max) * 100, 2)}%` }}
          title={`${s.day}: ${brl(s.cents)}`}
        />
      ))}
    </div>
  );
}

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function TrafficStat({ label, value, prev }: { label: string; value: number; prev: number }) {
  const pct = prev > 0 ? Math.round(((value - prev) / prev) * 100) : null;
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value.toLocaleString("pt-BR")}</p>
      {pct != null ? (
        <p
          className={`flex items-center gap-1 text-xs font-medium ${
            pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {pct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {pct >= 0 ? "+" : ""}{pct}%
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}

function UsersSparkline({ series }: { series: { date: string; users: number }[] }) {
  const max = Math.max(...series.map((s) => s.users), 1);
  return (
    <div className="mt-3 flex h-12 items-end gap-0.5" aria-hidden="true">
      {series.map((s) => (
        <div
          key={s.date}
          className="flex-1 rounded-sm bg-brand/30"
          style={{ height: `${Math.max((s.users / max) * 100, 2)}%` }}
          title={`${s.date}: ${s.users}`}
        />
      ))}
    </div>
  );
}

function BreakdownList({
  title, icon: Icon, rows, empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: { label: string; value: number }[];
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <p className="flex items-center gap-2 border-b border-border bg-surface-1 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={i} className="relative flex items-center justify-between gap-3 px-4 py-2.5">
              <span
                className="absolute inset-y-0 left-0 bg-brand/[0.07]"
                style={{ width: `${(r.value / max) * 100}%` }}
                aria-hidden="true"
              />
              <span className="relative z-10 min-w-0 truncate text-sm text-foreground">{r.label}</span>
              <span className="relative z-10 shrink-0 text-sm font-semibold text-foreground">
                {r.value.toLocaleString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface-1 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BigStat({
  icon: Icon, value, label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-bold text-foreground">{value.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StripStat({ href, n, label }: { href: string; n: number; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center rounded-md px-2.5 py-2 transition-colors hover:bg-accent"
    >
      <span className="font-bold text-foreground">{n.toLocaleString("pt-BR")}</span>
      <span className="ml-1 text-muted-foreground">{label}</span>
    </Link>
  );
}
