import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNfseBacklog } from "@/lib/admin/nfse";
import { getSupportOpenCount } from "@/lib/admin/support-tickets";
import { getPaymentProblemBacklog } from "@/lib/admin/payment-problems";
import { getModulesUnlockingSoon } from "@/lib/admin/module-unlock";
import { getExhaustedCoupons } from "@/lib/admin/coupons";
import { getAdminAlertsFeed } from "@/lib/admin/alerts-feed";

// Live, role-gated nudges for the admin notification bell (polled from the header).
// Returns only the sections the viewer's role may see:
//   - nfse backlog, payment problems, coupons, recent events → super_admin, billing_admin
//   - open tickets                                            → super_admin, support_admin, billing_admin
//   - modules unlocking soon                                  → super_admin, content_admin
export const dynamic = "force-dynamic";

const BILLING = ["super_admin", "billing_admin"];
const SUPPORT = ["super_admin", "support_admin", "billing_admin"];
const CONTENT = ["super_admin", "content_admin"];

const EMPTY_RESPONSE = {
  nfseReady: 0,
  nfseAtRisk: 0,
  supportOpen: 0,
  paymentProblemBacklog: 0,
  modulesUnlockingSoon: [] as Awaited<ReturnType<typeof getModulesUnlockingSoon>>,
  couponsExhausted: [] as Awaited<ReturnType<typeof getExhaustedCoupons>>,
  recentEvents: [] as Awaited<ReturnType<typeof getAdminAlertsFeed>>["items"],
  unseenCount: 0,
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json(EMPTY_RESPONSE);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = (profile?.role as string) ?? "member";

  const canBilling = BILLING.includes(role);
  const canSupport = SUPPORT.includes(role);
  const canContent = CONTENT.includes(role);

  const [nfse, supportOpen, paymentProblems, modulesUnlockingSoon, couponsExhausted, feed] =
    await Promise.all([
      canBilling ? getNfseBacklog() : Promise.resolve({ ready: 0, atRisk: 0, upcoming: 0, oldestDays: null }),
      canSupport ? getSupportOpenCount() : Promise.resolve(0),
      canBilling ? getPaymentProblemBacklog() : Promise.resolve({ count: 0, oldestDays: null }),
      canContent ? getModulesUnlockingSoon() : Promise.resolve([]),
      canBilling ? getExhaustedCoupons() : Promise.resolve([]),
      canBilling ? getAdminAlertsFeed(user.id, role) : Promise.resolve({ items: [], unseenCount: 0 }),
    ]);

  return NextResponse.json({
    nfseReady: nfse.ready,
    nfseAtRisk: nfse.atRisk,
    supportOpen,
    paymentProblemBacklog: paymentProblems.count,
    modulesUnlockingSoon,
    couponsExhausted,
    recentEvents: feed.items,
    unseenCount: feed.unseenCount,
  });
}
