"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell, BellRing, LifeBuoy, Receipt, CheckCircle2, ChevronRight,
  AlertTriangle, Ticket, Unlock, CreditCard, Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { markAdminAlertsSeen } from "@/actions/admin-notifications";

const POLL_MS = 60_000;

type ModuleUnlock = { moduleId: number; moduleName: string; cohortId: number; cohortName: string; unlockDate: string; daysUntil: number };
type ExhaustedCoupon = { id: number; code: string; redemptionsUsed: number; maxRedemptions: number };
type AlertFeedItem = { id: number; eventType: string; title: string; createdAt: string; href: string | null };

type Summary = {
  nfseReady: number;
  nfseAtRisk: number;
  supportOpen: number;
  paymentProblemBacklog: number;
  modulesUnlockingSoon: ModuleUnlock[];
  couponsExhausted: ExhaustedCoupon[];
  recentEvents: AlertFeedItem[];
  unseenCount: number;
};
const EMPTY: Summary = {
  nfseReady: 0,
  nfseAtRisk: 0,
  supportOpen: 0,
  paymentProblemBacklog: 0,
  modulesUnlockingSoon: [],
  couponsExhausted: [],
  recentEvents: [],
  unseenCount: 0,
};

const EVENT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  new_purchase: CreditCard,
  payment_problem: AlertTriangle,
  refund: Undo2,
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// Admin notification bell for the header. Polls a role-gated summary route and
// surfaces both standing backlogs (notas a emitir, chamados abertos, pagamentos
// retidos, cupons esgotados, módulos abrindo) and a "Recentes" feed of point-in-
// time business events (vendas, estornos) read from admin_alerts — the piece
// that previously only reached admins by email, never the UI.
export function AdminBell() {
  const { t } = useTranslation();
  const { isBillingAdmin, isSupportAdmin, isContentAdmin } = useAuth();
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const eligible = isBillingAdmin() || isSupportAdmin() || isContentAdmin();

  const refresh = useCallback(async () => {
    if (USE_MOCK_DATA) return;
    try {
      const res = await fetch("/api/admin/alerts-summary", { cache: "no-store" });
      if (!res.ok) return;
      setSummary(await res.json());
    } catch {
      /* transient — next tick retries */
    }
  }, []);

  useEffect(() => {
    if (!eligible) return;
    refresh();
    const tick = () => document.visibilityState === "visible" && refresh();
    const interval = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [eligible, refresh]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!eligible) return null;

  const total =
    summary.nfseReady +
    summary.supportOpen +
    summary.paymentProblemBacklog +
    summary.modulesUnlockingSoon.length +
    summary.couponsExhausted.length +
    summary.unseenCount;
  const BellIcon = total > 0 ? BellRing : Bell;

  function handleToggleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && summary.unseenCount > 0) {
      setSummary((s) => ({ ...s, unseenCount: 0 })); // optimistic
      markAdminAlertsSeen().catch(() => { /* silent — next poll re-derives */ });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label={t("adminBell.title")}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <BellIcon className="h-4 w-4" />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-brand-fg"
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold">{t("adminBell.title")}</h3>
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {total === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                {t("adminBell.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {summary.supportOpen > 0 && (
                  <li>
                    <Link
                      href="/admin/suporte"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1"
                    >
                      <LifeBuoy className="h-4 w-4 shrink-0 text-brand" />
                      <span className="flex-1 text-sm text-foreground">
                        {t("dashboard.openTickets")}
                      </span>
                      <span className="text-sm font-bold text-foreground">{summary.supportOpen}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                )}
                {summary.paymentProblemBacklog > 0 && (
                  <li>
                    <Link
                      href="/admin/billing"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span className="flex-1 text-sm text-foreground">{t("adminBell.paymentProblems")}</span>
                      <span className="text-sm font-bold text-foreground">{summary.paymentProblemBacklog}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                )}
                {summary.nfseReady > 0 && (
                  <li>
                    <Link
                      href="/admin/notas-fiscais"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1"
                    >
                      <Receipt
                        className={`h-4 w-4 shrink-0 ${
                          summary.nfseAtRisk > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-green-600 dark:text-green-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">
                          {t("dashboard.notasToIssue")}
                        </span>
                        {summary.nfseAtRisk > 0 && (
                          <span className="block text-[11px] text-red-600 dark:text-red-400">
                            {t("dashboard.notasAtRisk", { count: summary.nfseAtRisk })}
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-bold text-foreground">{summary.nfseReady}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                )}
                {summary.couponsExhausted.length > 0 && (
                  <li>
                    <Link
                      href="/admin/coupons"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1"
                    >
                      <Ticket className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">{t("adminBell.couponsExhausted")}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {summary.couponsExhausted.map((c) => c.code).join(", ")}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-foreground">{summary.couponsExhausted.length}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                )}
                {summary.modulesUnlockingSoon.length > 0 && (
                  <li>
                    <Link
                      href="/admin/cohorts"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-1"
                    >
                      <Unlock className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">{t("adminBell.modulesUnlocking")}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {summary.modulesUnlockingSoon
                            .map(
                              (m) =>
                                `${m.moduleName} · ${m.cohortName} (${
                                  m.daysUntil === 0 ? t("adminBell.unlocksToday") : t("adminBell.unlocksTomorrow")
                                })`,
                            )
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-foreground">{summary.modulesUnlockingSoon.length}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                )}

                {summary.recentEvents.length > 0 && (
                  <>
                    <li className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("adminBell.recent")}
                    </li>
                    {summary.recentEvents.slice(0, 8).map((ev) => {
                      const Icon = EVENT_ICON[ev.eventType] ?? CreditCard;
                      const content = (
                        <div className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-1">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 text-xs leading-snug text-foreground">{ev.title}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground/60">{relTime(ev.createdAt)}</span>
                        </div>
                      );
                      return (
                        <li key={ev.id}>
                          {ev.href ? (
                            <Link href={ev.href} onClick={() => setOpen(false)} className="block">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </li>
                      );
                    })}
                  </>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
