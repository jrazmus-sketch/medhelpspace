import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeadsOverview } from "@/lib/admin/leads";
import { LeadsClient } from "./leads-client";

export const metadata = { title: "Leads" };

// Leads carry PII (email, first name) and are commercial data, so gate to the
// same roles as the sibling Comercial pages (billing/notas/coupons). The nav
// hides the entry for other roles; this server-side check is the real fence
// (defense-in-depth — a direct URL hit still can't read the table).
const LEADS_ROLES = ["super_admin", "billing_admin"];

export default async function LeadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!LEADS_ROLES.includes((profile?.role as string) ?? "member")) {
    redirect("/admin");
  }

  const { rows, summary } = await getLeadsOverview();
  return <LeadsClient rows={rows} summary={summary} />;
}
