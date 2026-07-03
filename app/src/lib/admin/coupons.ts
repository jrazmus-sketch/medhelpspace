// Shared "exhausted coupons" computation — active promo codes that hit their
// max_redemptions cap. Used by the admin bell route and the daily digest cron.
// Live-computed (not admin_alerts-logged): a coupon can un-exhaust if an admin
// raises max_redemptions, so this must always reflect current state, not a
// point-in-time event.

import { createAdminClient } from "@/lib/supabase/admin";

export type ExhaustedCoupon = {
  id: number;
  code: string;
  redemptionsUsed: number;
  maxRedemptions: number;
};

export async function getExhaustedCoupons(): Promise<ExhaustedCoupon[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coupons")
    .select("id, code, redemptions_used, max_redemptions")
    .eq("active", true)
    .not("max_redemptions", "is", null)
    .limit(500);

  if (error || !data) {
    if (error) console.error("getExhaustedCoupons failed", error);
    return [];
  }

  return (data as { id: number; code: string; redemptions_used: number; max_redemptions: number }[])
    .filter((c) => c.redemptions_used >= c.max_redemptions)
    .map((c) => ({
      id: c.id,
      code: c.code,
      redemptionsUsed: c.redemptions_used,
      maxRedemptions: c.max_redemptions,
    }));
}
