import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const CONTENT_ROLES = ["super_admin", "content_admin"];

/** /admin/clinact is content-tier only (§3): super_admin + content_admin. */
export async function requireContentAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !CONTENT_ROLES.includes(profile.role as string)) redirect("/admin");
  return user;
}
