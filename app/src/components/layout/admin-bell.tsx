"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, LifeBuoy, Receipt, CheckCircle2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { USE_MOCK_DATA } from "@/lib/mock-data";

const POLL_MS = 60_000;

type Summary = { nfseReady: number; nfseAtRisk: number; supportOpen: number };
const EMPTY: Summary = { nfseReady: 0, nfseAtRisk: 0, supportOpen: 0 };

// Lightweight admin notification bell for the header. Polls a role-gated summary
// route and surfaces actionable nudges (notas a emitir, chamados abertos) with a
// one-click link to where they're resolved. Read-state free by design.
export function AdminBell() {
  const { t } = useTranslation();
  const { isBillingAdmin, isSupportAdmin } = useAuth();
  const [summary, setSummary] = useState<Summary>(EMPTY);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const eligible = isBillingAdmin() || isSupportAdmin();

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

  const total = summary.nfseReady + summary.supportOpen;
  const BellIcon = total > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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
        <div className="absolute right-0 top-full z-50 mt-2 w-[280px] overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold">{t("adminBell.title")}</h3>
          </div>
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
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
