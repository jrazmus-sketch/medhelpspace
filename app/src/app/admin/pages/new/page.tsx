import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewPageClient } from "./new-page-client";

export const metadata = { title: "Nova página" };

export default async function NewPagePage() {
  // Role gate — only super_admin and content_admin can create pages.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as string | undefined;
  if (!role || (role !== "super_admin" && role !== "content_admin")) {
    redirect("/admin/pages");
  }

  // Dropdown data — fetched server-side; the browser client hangs on REST calls.
  const admin = createAdminClient();
  const [{ data: specialties }, { data: tracks }, { data: modules }] = await Promise.all([
    admin.from("specialties").select("id, name").order("display_order"),
    admin.from("tracks").select("id, name, slug").order("id"),
    admin.from("content_modules").select("id, name").order("id"),
  ]);

  return (
    <NewPageClient
      specialties={(specialties ?? []) as SpecialtyOption[]}
      tracks={(tracks ?? []) as TrackOption[]}
      modules={(modules ?? []) as ModuleOption[]}
    />
  );
}

// ── Local types (server → client) ─────────────────────────────────────────────

export type SpecialtyOption = { id: number; name: string };
export type TrackOption = { id: number; name: string; slug: string };
export type ModuleOption = { id: number; name: string };
