import { getBellFeed } from "@/lib/notifications-feed";
import { NotificationBell } from "./notification-bell";

// Re-exported for back-compat with existing imports.
export type { UserNotification } from "@/lib/notifications-feed";

export async function NotificationBellServer() {
  const { notifications, unreadCount } = await getBellFeed();
  return <NotificationBell notifications={notifications} unreadCount={unreadCount} />;
}
