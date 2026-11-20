"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Hide / show the Notificações box on the Revalida home for the signed-in member (Karina 2026-11-20).
 * Writes ONLY profiles.home_notifications_hidden on the member's own row — never a notification, a read mark or a
 * dismissal — so the choice follows the member to every device and the bell keeps every notification.
 */
export async function setHomeNotificationsHidden(hidden: boolean): Promise<{ ok: boolean }> {
  if (typeof hidden !== "boolean") return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ home_notifications_hidden: hidden }).eq("id", user.id);
  if (error) {
    console.error("setHomeNotificationsHidden failed", error);
    return { ok: false };
  }
  return { ok: true };
}
