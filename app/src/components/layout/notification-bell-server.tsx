import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveAnnouncementsForUser } from "@/lib/announcements";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { NotificationBell } from "./notification-bell";

export type UserNotification = {
  id: number;
  // Which table this came from — routes mark-read / dismiss to the right place.
  source: "user" | "announcement";
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  icon: string | null;
  read_at: string | null;
  created_at: string;
};

// Admin announcements are authored as HTML; the bell renders plain text.
function htmlToText(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&#8217;/gi, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

const ANNOUNCEMENT_LIMIT = 15;

export async function NotificationBellServer() {
  if (USE_MOCK_DATA) {
    return <NotificationBell notifications={[]} unreadCount={0} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Per-user notifications (study plan, milestones, lifecycle emails, …)
  const { data: notifications } = await admin
    .from("user_notifications")
    .select("id, kind, title, body, href, icon, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);

  const userItems: UserNotification[] = (notifications ?? []).map((n) => ({
    ...n,
    source: "user" as const,
  }));

  // Admin announcements — same source as the dashboard ticker, surfaced here too.
  const announcements = await getLiveAnnouncementsForUser(user.id, ANNOUNCEMENT_LIMIT);
  const announcementItems: UserNotification[] = announcements.map((a) => ({
    id: a.id,
    source: "announcement" as const,
    kind: "announcement",
    title: a.title,
    body: htmlToText(a.body_html),
    href: "/app",
    icon: a.priority === "urgent" ? "alert" : "mail",
    read_at: a.is_read ? a.publish_at : null,
    created_at: a.publish_at,
  }));

  const list = [...userItems, ...announcementItems]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);

  const unreadCount = list.filter((n) => !n.read_at).length;

  return <NotificationBell notifications={list} unreadCount={unreadCount} />;
}
