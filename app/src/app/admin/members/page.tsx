import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MembersClient } from "./members-client";

export const metadata = { title: "Membros" };

export default async function MembersPage() {
  const [supabase, admin] = [await createClient(), createAdminClient()];

  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = user
    ? await admin.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };

  const [{ data: profiles }, { data: memberships }, { data: cohorts }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, display_name, role, created_at")
      .order("created_at", { ascending: false }),
    admin.from("user_cohort_memberships").select("user_id, cohort_id"),
    admin.from("cohorts").select("id, name, slug").order("id"),
  ]);

  const cohortByUser = new Map(
    (memberships ?? []).map((m) => [m.user_id, m.cohort_id as number]),
  );

  const rows = (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: p.email as string,
    display_name: p.display_name as string | null,
    role: p.role as string,
    created_at: p.created_at as string,
    cohort_id: cohortByUser.get(p.id as string) ?? null,
  }));

  return (
    <MembersClient
      rows={rows}
      cohorts={(cohorts ?? []).map((c) => ({ id: c.id as number, name: c.name as string }))}
      currentUserRole={(currentProfile?.role as string) ?? "member"}
    />
  );
}
