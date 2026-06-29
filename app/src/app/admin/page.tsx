import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/admin/dashboard-stats";
import { AdminDashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const BILLING_ROLES = ["super_admin", "billing_admin"];
const SUPPORT_ROLES = ["super_admin", "support_admin", "billing_admin"];

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();

  const role = (profile?.role as string) ?? "member";
  if (role === "member") redirect("/app");

  const canSeeBilling = BILLING_ROLES.includes(role);
  const canSeeSupport = SUPPORT_ROLES.includes(role);
  const canSeeAudit = role === "super_admin";

  const data = await getAdminDashboardData({ canSeeBilling, canSeeSupport, canSeeAudit });

  return (
    <AdminDashboardClient
      data={data}
      displayName={(profile?.display_name as string | null) ?? null}
      canSeeBilling={canSeeBilling}
      canSeeSupport={canSeeSupport}
      canSeeAudit={canSeeAudit}
    />
  );
}
