import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { NotificationsClient } from "./notifications-client";
import type { AnnouncementCategory, Announcement, Cohort } from "@/types/supabase";

export const metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role === "member") redirect("/admin");

  const admin = createAdminClient();

  const [
    { data: categories },
    { data: announcements },
    { data: cohorts },
    { data: tickerSetting },
  ] = await Promise.all([
    admin.from("announcement_categories").select("*").order("sort_order"),
    admin
      .from("announcements")
      .select("*, category:announcement_categories(id,slug,label,color,sort_order,created_at)")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("cohorts").select("id,slug,name").eq("active", true).order("id"),
    admin.from("site_settings").select("value").eq("key", "ticker_label").single(),
  ]);

  return (
    <NotificationsClient
      categories={(categories ?? []) as AnnouncementCategory[]}
      announcements={(announcements ?? []) as (Announcement & { category: AnnouncementCategory })[]}
      cohorts={(cohorts ?? []) as Pick<Cohort, "id" | "slug" | "name">[]}
      tickerLabel={tickerSetting?.value ?? "NOTIFICAÇÕES"}
    />
  );
}
