import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import type { LogEntry, Profile } from "./audit-log-client";
import { AuditLogClient } from "./audit-log-client";

export const metadata = { title: "Audit Log" };

export default async function AuditLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "super_admin") redirect("/admin");

  const admin = createAdminClient();

  const { data: rawLogs } = await admin
    .from("admin_audit_log")
    .select("id, actor_user_id, action, target_user_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (rawLogs ?? []) as LogEntry[];

  // Collect unique user IDs across actor + target columns
  const userIds = [
    ...new Set([
      ...logs.map((l) => l.actor_user_id),
      ...logs.filter((l) => l.target_user_id).map((l) => l.target_user_id as string),
    ]),
  ];

  const { data: profiles } = userIds.length
    ? await admin
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds)
    : { data: [] };

  const profileMap: Record<string, Profile> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = p as Profile;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">{logs.length} entradas mais recentes</p>
      </div>
      <AuditLogClient logs={logs} profileMap={profileMap} />
    </div>
  );
}
