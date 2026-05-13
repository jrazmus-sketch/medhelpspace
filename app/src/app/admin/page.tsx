import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [
    { count: memberCount },
    { count: cohortCount },
    { count: draftCount },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("cohorts").select("*", { count: "exact", head: true }),
    admin.from("pages").select("*", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  return (
    <AdminDashboardClient
      memberCount={memberCount ?? 0}
      cohortCount={cohortCount ?? 0}
      draftCount={draftCount ?? 0}
    />
  );
}
