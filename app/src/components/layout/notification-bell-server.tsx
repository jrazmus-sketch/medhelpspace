import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK_DATA } from "@/lib/mock-data";
import { NotificationBell } from "./notification-bell";

export type UserNotification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  icon: string | null;
  read_at: string | null;
  created_at: string;
};

export async function NotificationBellServer() {
  if (USE_MOCK_DATA) {
    return <NotificationBell notifications={[]} unreadCount={0} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: notifications } = await admin
    .from("user_notifications")
    .select("id, kind, title, body, href, icon, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(15);

  const list = (notifications ?? []) as UserNotification[];
  const unreadCount = list.filter((n) => !n.read_at).length;

  return <NotificationBell notifications={list} unreadCount={unreadCount} />;
}
