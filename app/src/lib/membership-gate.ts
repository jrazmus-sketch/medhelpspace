import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";

const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

/**
 * Call this at the top of any content server component that should require
 * an active cohort membership. Admins bypass the gate entirely.
 * Redirects to /acesso-encerrado if membership is missing or expired.
 * Pass contentModuleId to also enforce module-level access (e.g. MedHelp 60D).
 */
export async function requireActiveMembership(contentModuleId?: number | null) {
  if (USE_MOCK_DATA) return;

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

  if (ADMIN_ROLES.includes(profile?.role ?? "")) return;

  const { data: hasMembership } = await supabase.rpc("user_has_active_membership");
  if (!hasMembership) redirect("/acesso-encerrado");

  if (contentModuleId) {
    const { data: hasModuleAccess } = await supabase.rpc("user_has_module_access", {
      mod_id: contentModuleId,
    });
    if (!hasModuleAccess) redirect("/acesso-encerrado?motivo=modulo-bloqueado");
  }
}
