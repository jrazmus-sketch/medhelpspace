import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIEWAS_COOKIE, parseViewAs } from "@/lib/viewas";
import { AdminBar } from "./admin-bar";

export type CohortOption = { id: number; slug: string; name: string };

export async function AdminBarServer() {
  const store = await cookies();
  const viewas = parseViewAs(store.get(VIEWAS_COOKIE)?.value);

  const admin = createAdminClient();
  const { data } = await admin
    .from("cohorts")
    .select("id, slug, name")
    .eq("active", true)
    .order("id");

  return <AdminBar viewas={viewas} cohorts={(data ?? []) as CohortOption[]} />;
}
