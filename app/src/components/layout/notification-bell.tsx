"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, BellRing, Calendar, Trophy, Lock, Mail, AlertTriangle,
  TrendingUp, X as XIcon, Eye, Check,
} from "lucide-react";
import {
  markNotificationsRead, markAllNotificationsRead, dismissNotification,
} from "@/actions/notifications";
import { markAnnouncementsRead } from "@/actions/admin";
import { setHomeNotificationsHidden } from "@/actions/home-notifications";
import { announceHomeNotifications, onHomeNotifications } from "@/lib/home-notifications-event";
import type { UserNotification, BellFeed } from "@/lib/notifications-feed";

// How often to poll for new notifications while the tab is visible.
const POLL_INTERVAL_MS = 30_000;

// IDs collide across the two source tables, so identity is (source, id).
const keyOf = (n: UserNotification) => `${n.source}-${n.id}`;

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
  homeHidden = false,
}: {
  notifications: UserNotification[];
  unreadCount: number;
  homeHidden?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [localUnread, setLocalUnread] = useState(unreadCount);
  const [localList, setLocalList] = useState(notifications);
  // Home Notificações box hidden with its X → offer to bring it back (Karina 2026-11-20).
  const [boxHidden, setBoxHidden] = useState(homeHidden);
  const [boxRestored, setBoxRestored] = useState(false);
  // A feed fetched just before an X / restore was saved still carries the old value: for a few seconds after a change
  // made here, what just happened wins over the feed (the server has it by then).
  const lastBoxChange = useRef(0);
  const pathname = usePathname();
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Phones: the popover spans the screen (8px each side) under the bell, wherever the bell sits in the header — a fixed
  // offset broke whenever the header's icons changed. Desktop (md+) keeps the 340px panel anchored to the bell.
  const [phoneTop, setPhoneTop] = useState<number | null>(null);

  // Sync with server props on prop change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalUnread(unreadCount);
    setLocalList(notifications);
    if (Date.now() - lastBoxChange.current > 10_000) setBoxHidden(homeHidden);
  }, [unreadCount, notifications, homeHidden]);

  // The box on the home was just hidden (its X) or restored (its Desfazer): follow it at once.
  useEffect(
    () =>
      onHomeNotifications((h) => {
        lastBoxChange.current = Date.now();
        setBoxHidden(h);
        if (h) setBoxRestored(false);
      }),
    [],
  );

  function restoreHomeBox(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    lastBoxChange.current = Date.now();
    setBoxHidden(false);
    setBoxRestored(true);
    announceHomeNotifications(false);
    setHomeNotificationsHidden(false).catch(() => { /* the next poll shows the saved state */ });
  }

  // Pull the latest feed from our own API route (a plain fetch — NOT the browser
  // Supabase client, which is banned in this app). Same merge as the SSR render.
  const refreshFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const feed: BellFeed = await res.json();
      setLocalList(feed.notifications);
      setLocalUnread(feed.unreadCount);
      if (Date.now() - lastBoxChange.current > 10_000) setBoxHidden(feed.homeHidden);
    } catch {
      /* transient — next tick retries */
    }
  }, []);

  // Near-real-time updates: poll on an interval while visible, and refetch
  // immediately when the tab regains focus. Pause while the popover is open so a
  // poll never clobbers the optimistic mark-as-read / dismiss happening in it.
  useEffect(() => {
    if (open) return;
    const tick = () => {
      if (document.visibilityState === "visible") refreshFeed();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [open, refreshFeed]);

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
      const r = buttonRef.current?.getBoundingClientRect();
      setPhoneTop(r && window.innerWidth < 768 ? Math.round(r.bottom + 8) : null);
      // Optimistic mark-all-read when opening (server calls fire async)
      const unread = localList.filter((n) => !n.read_at);
      if (unread.length > 0) {
        const nowIso = new Date().toISOString();
        const unreadKeys = new Set(unread.map(keyOf));
        setLocalUnread(0);
        setLocalList((prev) => prev.map((n) => (unreadKeys.has(keyOf(n)) ? { ...n, read_at: nowIso } : n)));

        const userIds = unread.filter((n) => n.source === "user").map((n) => n.id);
        const announcementIds = unread.filter((n) => n.source === "announcement").map((n) => n.id);
        if (userIds.length > 0) markNotificationsRead(userIds).catch(() => { /* silent */ });
        if (announcementIds.length > 0) markAnnouncementsRead(announcementIds).catch(() => { /* silent */ });
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

  async function handleDismiss(n: UserNotification, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Announcements are shared/feed items — they can be read but not dismissed
    // per-user (no dismiss button is rendered for them).
    if (n.source !== "user") return;
    setLocalList((prev) => prev.filter((x) => keyOf(x) !== keyOf(n)));
    await dismissNotification(n.id);
  }

  async function handleMarkAllRead(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const unreadAnnouncementIds = localList
      .filter((n) => n.source === "announcement" && !n.read_at)
      .map((n) => n.id);
    setLocalUnread(0);
    setLocalList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markAllNotificationsRead();
    if (unreadAnnouncementIds.length > 0) {
      await markAnnouncementsRead(unreadAnnouncementIds).catch(() => { /* silent */ });
    }
  }

  const BellIcon = localUnread > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        ref={buttonRef}
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
          className={
            phoneTop != null
              ? "fixed inset-x-2 z-50 overflow-y-auto rounded-lg border border-border bg-background shadow-2xl"
              : "absolute right-0 top-full z-50 mt-2 w-[340px] overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
          }
          style={phoneTop != null ? { top: phoneTop, maxHeight: `calc(100dvh - ${phoneTop + 8}px)` } : undefined}
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

          {/* Bring back the home box hidden with its X — only while it is hidden (Karina 2026-11-20). */}
          {boxHidden && (
            <button
              type="button"
              onClick={restoreHomeBox}
              className="flex min-h-11 w-full items-center gap-2.5 border-b border-border bg-brand/5 px-4 py-2.5 text-left text-sm font-medium text-brand transition-colors hover:bg-brand/10"
            >
              <Eye className="h-4 w-4 shrink-0" />
              Mostrar notificações na página inicial
            </button>
          )}
          {!boxHidden && boxRestored && (
            <p
              role="status"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-brand/5 px-4 py-2.5 text-[13px] text-foreground"
            >
              <Check className="h-4 w-4 shrink-0 text-brand" />
              As notificações voltaram para a página inicial.
              {pathname !== "/app" && (
                <Link href="/app" onClick={() => setOpen(false)} className="font-semibold text-brand hover:underline">
                  Ir para a página inicial
                </Link>
              )}
            </p>
          )}

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
                      {n.source === "user" && (
                        <button
                          onClick={(e) => handleDismiss(n, e)}
                          aria-label="Dispensar"
                          className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-surface-2 hover:text-foreground"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <li key={keyOf(n)}>
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
