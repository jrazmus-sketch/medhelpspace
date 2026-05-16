import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NotificationStripClient } from "./notification-strip-client";
import type { AnnouncementWithCategory } from "@/types/supabase";

export async function NotificationStrip() {
  const admin = createAdminClient();

  // Fetch ticker label
  const { data: settingRow } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "ticker_label")
    .single();
  const tickerLabel = settingRow?.value ?? "NOTIFICAÇÕES";

  // Fetch published announcements (RLS would filter, but admin client bypasses for now;
  // we filter manually so member-facing view respects publish_at)
  const { data: rows } = await admin
    .from("announcements")
    .select("*, category:announcement_categories(*)")
    .eq("status", "published")
    .lte("publish_at", new Date().toISOString())
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false })
    .limit(20);

  if (!rows || rows.length === 0) return null;

  // Fetch which announcements the current user has already read
  let readIds = new Set<number>();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: reads } = await admin
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", rows.map((r: { id: number }) => r.id));
      readIds = new Set((reads ?? []).map((r: { announcement_id: number }) => r.announcement_id));
    }
  } catch {
    // unauthenticated or error — all unread
  }

  const announcements: AnnouncementWithCategory[] = rows.map((r) => ({
    ...r,
    is_read: readIds.has(r.id),
  }));

  return (
    <NotificationStripClient
      announcements={announcements}
      tickerLabel={tickerLabel}
    />
  );
}
