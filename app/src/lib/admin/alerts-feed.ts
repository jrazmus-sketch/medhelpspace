// Recent-events feed for the admin bell — the piece that was missing: admin_alerts
// rows get written (and emailed) on new_purchase / payment_problem / refund, but
// nothing ever read them back into the UI. This is that read path.
//
// admin_alerts is a SHARED append-only log (not per-user rows), so "unread" is a
// single per-admin cursor (admin_alerts_seen.last_seen_at) rather than per-row
// read-state — anything created after the cursor counts as unseen. Opening the
// bell advances the cursor (markAdminAlertsSeen).
//
// support_ticket is deliberately excluded — it already has its own live "open
// count" row in the bell (getSupportOpenCount), no need to double-signal it here.

import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN_NOTIFY_ELIGIBLE_ROLES, type AdminAlertEvent } from "@/lib/admin-notify-types";

const FEED_EVENTS: AdminAlertEvent[] = ["new_purchase", "payment_problem", "refund"];
const FEED_WINDOW_DAYS = 14;
const FEED_LIMIT = 30;

const EVENT_HREF: Partial<Record<AdminAlertEvent, string>> = {
  new_purchase: "/admin/members",
  payment_problem: "/admin/billing",
  refund: "/admin/billing",
};

export type AlertFeedItem = {
  id: number;
  eventType: AdminAlertEvent;
  title: string;
  createdAt: string;
  href: string | null;
};

export async function getAdminAlertsFeed(
  userId: string,
  role: string | null | undefined,
): Promise<{ items: AlertFeedItem[]; unseenCount: number }> {
  const events = FEED_EVENTS.filter((e) => ADMIN_NOTIFY_ELIGIBLE_ROLES[e].includes(role ?? ""));
  if (events.length === 0) return { items: [], unseenCount: 0 };

  const admin = createAdminClient();
  const since = new Date(Date.now() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: alerts, error: alertsErr }, { data: seenRow }] = await Promise.all([
    admin
      .from("admin_alerts")
      .select("id, event_type, title, created_at")
      .in("event_type", events)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    admin.from("admin_alerts_seen").select("last_seen_at").eq("user_id", userId).maybeSingle(),
  ]);

  if (alertsErr || !alerts) {
    if (alertsErr) console.error("getAdminAlertsFeed failed", alertsErr);
    return { items: [], unseenCount: 0 };
  }

  const lastSeenAt = (seenRow?.last_seen_at as string | undefined) ?? "1970-01-01T00:00:00Z";
  const lastSeenMs = new Date(lastSeenAt).getTime();

  const items: AlertFeedItem[] = alerts.map((a) => ({
    id: a.id as number,
    eventType: a.event_type as AdminAlertEvent,
    title: a.title as string,
    createdAt: a.created_at as string,
    href: EVENT_HREF[a.event_type as AdminAlertEvent] ?? null,
  }));

  const unseenCount = items.filter((i) => new Date(i.createdAt).getTime() > lastSeenMs).length;

  return { items, unseenCount };
}

export async function markAdminAlertsSeen(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("admin_alerts_seen")
      .upsert({ user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (e) {
    console.error("markAdminAlertsSeen failed", userId, e);
  }
}
