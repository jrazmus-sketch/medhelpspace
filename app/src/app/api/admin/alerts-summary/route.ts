import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNfseBacklog } from "@/lib/admin/nfse";
import { getSupportOpenCount } from "@/lib/admin/support-tickets";

// Live, role-gated nudges for the admin notification bell (polled from the header).
// Returns only the counts the viewer's role may see:
//   - nfse backlog  → super_admin, billing_admin
//   - open tickets  → super_admin, support_admin, billing_admin
export const dynamic = "force-dynamic";

const BILLING = ["super_admin", "billing_admin"];
const SUPPORT = ["super_admin", "support_admin", "billing_admin"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ nfseReady: 0, nfseAtRisk: 0, supportOpen: 0 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "member";

  const canBilling = BILLING.includes(role);
  const canSupport = SUPPORT.includes(role);

  const [nfse, supportOpen] = await Promise.all([
    canBilling ? getNfseBacklog() : Promise.resolve({ ready: 0, atRisk: 0, upcoming: 0, oldestDays: null }),
    canSupport ? getSupportOpenCount() : Promise.resolve(0),
  ]);

  return NextResponse.json({
    nfseReady: nfse.ready,
    nfseAtRisk: nfse.atRisk,
    supportOpen,
  });
}
