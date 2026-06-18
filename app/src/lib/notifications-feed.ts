import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLiveAnnouncementsForUser } from "@/lib/announcements";
import { USE_MOCK_DATA } from "@/lib/mock-data";

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

export type BellFeed = {
  notifications: UserNotification[];
  unreadCount: number;
};

const EMPTY_FEED: BellFeed = { notifications: [], unreadCount: 0 };
const FEED_LIMIT = 15;

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

/**
 * The notification-bell feed for the current user: per-user notifications merged
 * with live admin announcements, newest first, capped at FEED_LIMIT.
 *
 * Shared by the server component (initial render) and the polling server action
 * (live updates) so both always produce an identical feed.
 */
export async function getBellFeed(): Promise<BellFeed> {
  if (USE_MOCK_DATA) return EMPTY_FEED;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY_FEED;

  const admin = createAdminClient();

  // Per-user notifications (study plan, milestones, lifecycle emails, …)
  const { data: notifications } = await admin
    .from("user_notifications")
    .select("id, kind, title, body, href, icon, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);

  const userItems: UserNotification[] = (notifications ?? []).map((n) => ({
    ...n,
    source: "user" as const,
  }));

  // Admin announcements — same source as the dashboard ticker, surfaced here too.
  const announcements = await getLiveAnnouncementsForUser(user.id, FEED_LIMIT);
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
    .slice(0, FEED_LIMIT);

  return { notifications: list, unreadCount: list.filter((n) => !n.read_at).length };
}
