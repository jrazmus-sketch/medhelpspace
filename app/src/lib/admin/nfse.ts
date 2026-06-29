// Shared NFS-e (nota fiscal) backlog computation — the single source of truth for
// "which paid orders need a nota issued and how urgent". Used by the admin bell
// route and the daily digest cron. (The dashboard derives the same numbers inline
// from the order scan it already runs, mirroring this rule.)
//
// Rule: a nota is "ready" once a paid order clears the 7-day satisfaction guarantee
// (issuable on day 8) and hasn't been issued/skipped. It is "at risk" when it is
// ready AND its purchase month is already over — i.e. it is slipping its competência
// month. "Upcoming" becomes ready within the next few days.

import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const GUARANTEE_DAYS = 7;
const UPCOMING_DAYS = 3;

export type NfseBacklog = {
  ready: number;
  atRisk: number;
  upcoming: number;
  oldestDays: number | null;
};

export async function getNfseBacklog(): Promise<NfseBacklog> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("created_at")
    .eq("status", "paid")
    .is("nfse_status", null)
    .limit(5000);

  const now = Date.now();
  const nowD = new Date(now);
  const nowMonthIdx = nowD.getFullYear() * 12 + nowD.getMonth();

  let ready = 0, atRisk = 0, upcoming = 0, oldestMs = 0;
  for (const o of (data ?? []) as { created_at: string }[]) {
    const cMs = new Date(o.created_at).getTime();
    const eligibleMs = cMs + GUARANTEE_DAYS * DAY_MS;
    if (now >= eligibleMs) {
      ready += 1;
      const created = new Date(cMs);
      if (created.getFullYear() * 12 + created.getMonth() < nowMonthIdx) atRisk += 1;
      if (now - cMs > oldestMs) oldestMs = now - cMs;
    } else if (eligibleMs <= now + UPCOMING_DAYS * DAY_MS) {
      upcoming += 1;
    }
  }

  return { ready, atRisk, upcoming, oldestDays: ready > 0 ? Math.floor(oldestMs / DAY_MS) : null };
}
