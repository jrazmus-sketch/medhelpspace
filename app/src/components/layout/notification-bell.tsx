"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, BellRing, Calendar, Trophy, Lock, Mail, AlertTriangle,
  TrendingUp, Check, X as XIcon,
} from "lucide-react";
import { markNotificationsRead, markAllNotificationsRead, dismissNotification } from "@/actions/notifications";
import type { UserNotification } from "./notification-bell-server";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  calendar: Calendar,
  trophy: Trophy,
  lock: Lock,
  mail: Mail,
  alert: AlertTriangle,
  trend: TrendingUp,
};

function iconFor(notification: UserNotification): React.ComponentType<{ className?: string; size?: number }> {
  if (notification.icon && ICON_MAP[notification.icon]) return ICON_MAP[notification.icon];
  switch (notification.kind) {
    case "plan-ready":
    case "plan-regenerated":
    case "weekly-summary":
    case "flashcards-due":
      return Calendar;
    case "60d-unlock":
      return Lock;
    case "expiry-warning-7d":
    case "expiry-notice":
      return AlertTriangle;
    case "weak-specialty":
      return TrendingUp;
    case "milestone-100q":
    case "milestone-streak-7":
    case "milestone-streak-30":
      return Trophy;
    case "missed-3-days":
      return Bell;
    default:
      return Bell;
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}sem`;
  const mo = Math.floor(d / 30);
  return `${mo}mes`;
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: UserNotification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const [localList, setLocalList] = useState(notifications);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Sync with server props on prop change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalUnread(unreadCount);
    setLocalList(notifications);
  }, [unreadCount, notifications]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleToggleOpen() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      // Optimistic mark-all-read when opening (server call fires async)
      const unreadIds = localList.filter((n) => !n.read_at).map((n) => n.id);
      if (unreadIds.length > 0) {
        const nowIso = new Date().toISOString();
        setLocalUnread(0);
        setLocalList((prev) => prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: nowIso } : n)));
        markNotificationsRead(unreadIds).catch(() => { /* silent */ });
      }
    }
  }

  function handleNotificationClick(n: UserNotification, e: React.MouseEvent) {
    if (!n.href) {
      e.preventDefault();
      return;
    }
    setOpen(false);
  }

  async function handleDismiss(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLocalList((prev) => prev.filter((n) => n.id !== id));
    await dismissNotification(id);
  }

  async function handleMarkAllRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLocalUnread(0);
    setLocalList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markAllNotificationsRead();
  }

  const BellIcon = localUnread > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-label={`Notificações${localUnread > 0 ? ` (${localUnread} não lidas)` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <BellIcon className="h-4 w-4" />
        {localUnread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold leading-none text-brand-fg"
          >
            {localUnread > 9 ? "9+" : localUnread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-[-82px] top-full z-50 mt-2 w-[calc(100vw-16px)] overflow-hidden rounded-lg border border-border bg-background shadow-2xl md:right-0 md:w-[340px]"
          role="dialog"
          aria-label="Notificações"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Notificações</h3>
            {localList.some((n) => !n.read_at) && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-brand hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {localList.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Você receberá avisos sobre seu plano de estudos aqui.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {localList.map((n) => {
                  const Icon = iconFor(n);
                  const isUnread = !n.read_at;
                  const content = (
                    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-1">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          isUnread ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                            {n.title}
                          </p>
                          {isUnread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                        </div>
                        {n.body && (
                          <p className="mt-1 text-xs leading-snug text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground/60">
                          {relTime(n.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDismiss(n.id, e)}
                        aria-label="Dispensar"
                        className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          onClick={(e) => handleNotificationClick(n, e)}
                          className="block"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {localList.length > 0 && (
            <div className="border-t border-border px-4 py-2.5">
              <Link
                href="/app/plano"
                onClick={() => setOpen(false)}
                className="block text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Ver seu plano de estudos →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
