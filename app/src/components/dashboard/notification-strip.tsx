import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLiveAnnouncementsForUser } from "@/lib/announcements";
import { NotificationStripClient } from "./notification-strip-client";

export async function NotificationStrip() {
  const admin = createAdminClient();

  // Fetch ticker label
  const { data: settingRow } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", "ticker_label")
    .single();
  const tickerLabel = settingRow?.value ?? "NOTIFICAÇÕES";

  // Resolve the current user (for per-user read state)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // unauthenticated or error — all unread
  }

  const announcements = await getLiveAnnouncementsForUser(userId);
  if (announcements.length === 0) return null;

  return (
    <NotificationStripClient
      announcements={announcements}
      tickerLabel={tickerLabel}
    />
  );
}
