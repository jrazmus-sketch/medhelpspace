"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLeadDetail, type LeadDetail } from "@/lib/admin/lead-detail";

// Server action backing the /admin/leads detail drawer. Leads carry PII + are
// commercial data, so this is gated to the SAME roles as the Leads page + OCI panel
// (billing tier). "use server" files export ONLY async functions.

const LEADS_ROLES = ["super_admin", "billing_admin"];

async function requireLeadsRole() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "member";
  if (!LEADS_ROLES.includes(role)) throw new Error("Unauthorized");
}

/** Full per-lead detail (attribution, quiz breakdown, email timeline, journey). */
export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  await requireLeadsRole();
  return fetchLeadDetail(id);
}
