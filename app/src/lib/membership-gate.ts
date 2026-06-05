import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK_DATA } from "@/lib/mock-data";

const ADMIN_ROLES = ["super_admin", "content_admin", "support_admin", "billing_admin"];

/**
 * Returns true if the current viewer holds any admin role. Used to gate
 * draft-page visibility: the member-facing content route reads pages with the
 * service-role client (RLS bypassed), so the `status='publish'` filter that RLS
 * would normally apply has to be re-checked in app code — admins see drafts,
 * members never do, even via a direct URL.
 */
export async function isViewerAdmin(): Promise<boolean> {
  if (USE_MOCK_DATA) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return ADMIN_ROLES.includes(profile?.role ?? "");
}

/**
 * Call this at the top of any content server component that should require
 * an active cohort membership. Admins bypass the gate entirely.
 * No active membership → /loja (the store) so the visitor can buy access.
 * An unlocked-but-not-yet-available module → /app/acesso-encerrado (the user
 * IS a member; the 60D module just hasn't opened yet).
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
  if (!hasMembership) redirect("/loja");

  if (contentModuleId) {
    const { data: hasModuleAccess } = await supabase.rpc("user_has_module_access", {
      mod_id: contentModuleId,
    });
    // The buyer is a member, so this lives inside the /app layout (no redirect loop).
    if (!hasModuleAccess) redirect("/app/acesso-encerrado?motivo=modulo-bloqueado");
  }
}
