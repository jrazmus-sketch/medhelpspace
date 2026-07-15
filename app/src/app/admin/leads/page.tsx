import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeadsRows } from "@/lib/admin/leads";
import { getFunnelEventDays } from "@/lib/admin/funnel";
import { getOciReadyCounts } from "@/lib/admin/oci";
import { getEmailSettings } from "@/lib/email";
import { LeadsClient } from "./leads-client";
import { OciPanel } from "./oci-panel";

export const metadata = { title: "Leads" };

// A custom-email broadcast fans out sends inside the Server Action invoked from this
// route, so give it the same 60s budget the drip cron uses (default is far shorter).
export const maxDuration = 60;

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

  const [rows, funnelEvents, ociCounts, emailSettings] = await Promise.all([
    getLeadsRows(),
    getFunnelEventDays(),
    getOciReadyCounts(),
    getEmailSettings(),
  ]);
  // The funnel panel renders INSIDE LeadsClient so clicking a stage can filter
  // the table, and so both share one client-side filter definition. The OCI
  // exporter is a weekly chore, not a stat — collapsed, at the bottom. emailSettings
  // feeds the broadcast modal's live preview (accurate footer/CNPJ/from address).
  return (
    <div className="space-y-8">
      <LeadsClient rows={rows} funnelEvents={funnelEvents} emailSettings={emailSettings} />
      <OciPanel counts={ociCounts} />
    </div>
  );
}
