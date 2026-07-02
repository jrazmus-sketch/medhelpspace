import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EstudioClient } from "./estudio-client";

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

  return <EstudioClient />;
}
