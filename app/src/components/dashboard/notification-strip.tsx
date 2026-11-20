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

  // The member may have hidden the box with its X (Karina 2026-11-20). It still renders — hidden — so the bell can
  // bring it back in place without a reload.
  let hidden = false;
  if (userId) {
    const { data: profile } = await admin
      .from("profiles")
      .select("home_notifications_hidden")
      .eq("id", userId)
      .maybeSingle();
    hidden = Boolean(profile?.home_notifications_hidden);
  }

  return (
    <NotificationStripClient
      announcements={announcements}
      tickerLabel={tickerLabel}
      initiallyHidden={hidden}
    />
  );
}
