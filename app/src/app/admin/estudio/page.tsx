import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EstudioClient } from "./estudio-client";
import type { SavedTemplate } from "@/lib/studio/saved-templates";

export const metadata = { title: "Instagram Studio" };

// Marketing/design tool — content-capable roles only. The admin layout already
// fences out members; this narrows it to the roles that produce content, and
// mirrors the nav gate (defense-in-depth: a direct URL hit still redirects).
const STUDIO_ROLES = ["super_admin", "content_admin"];

export default async function EstudioPage() {
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

  if (!STUDIO_ROLES.includes((profile?.role as string) ?? "member")) {
    redirect("/admin");
  }

  // Shared saved-template library, read server-side (browser client hangs on
  // reads in this app). Tolerate the table not existing yet in an environment
  // where the schema patch hasn't been applied — the studio still works, just
  // with an empty "Saved" row.
  let initialTemplates: SavedTemplate[] = [];
  const { data: tpls } = await supabase
    .from("estudio_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (tpls) initialTemplates = tpls as SavedTemplate[];

  return <EstudioClient initialTemplates={initialTemplates} />;
}
