import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErrorsClient, type AppErrorRow } from "./errors-client";

export const metadata = { title: "Erros" };
export const dynamic = "force-dynamic";

/**
 * Site errors (app_errors): one row per distinct server or browser error, with
 * how often and how recently it happened. super_admin only — stack traces and
 * routes are an engineering concern.
 */
export default async function ErrorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "super_admin") redirect("/admin");

  const { data } = await createAdminClient()
    .from("app_errors")
    .select("id, kind, message, route, digest, stack, last_path, user_agent, count, first_seen, last_seen")
    .order("last_seen", { ascending: false })
    .limit(200);

  return <ErrorsClient rows={(data ?? []) as AppErrorRow[]} />;
}
