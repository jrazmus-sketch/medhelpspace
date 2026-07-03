// Shared "unresolved payment problems" computation — paid-attempt orders that
// triggered a payment_problem admin_alerts row (amount mismatch / membership
// grant failure / status-flip failure — see lib/pagbank/finalize.ts) and are
// still sitting in 'pending' status. Used by the admin bell route.
//
// No explicit "resolved" flag exists (none of finalizePaidOrder's held-order
// paths do): the only way an order stops being a problem today is an admin
// manually changing its status away from 'pending' (e.g. via the Supabase
// dashboard or a future admin/billing action), which is exactly what this
// query re-checks live rather than caching a stale count.

import { createAdminClient } from "@/lib/supabase/admin";

export type PaymentProblemBacklog = {
  count: number;
  oldestDays: number | null;
};

export async function getPaymentProblemBacklog(): Promise<PaymentProblemBacklog> {
  const admin = createAdminClient();

  const { data: alerts, error: alertsErr } = await admin
    .from("admin_alerts")
    .select("context_id")
    .eq("event_type", "payment_problem")
    .not("context_id", "is", null)
    .limit(2000);

  if (alertsErr || !alerts || alerts.length === 0) {
    if (alertsErr) console.error("getPaymentProblemBacklog: alerts query failed", alertsErr);
    return { count: 0, oldestDays: null };
  }

  const orderIds = [...new Set(alerts.map((a) => a.context_id as string))];

  const { data: orders, error: ordersErr } = await admin
    .from("orders")
    .select("created_at")
    .eq("status", "pending")
    .in("id", orderIds);

  if (ordersErr || !orders) {
    if (ordersErr) console.error("getPaymentProblemBacklog: orders query failed", ordersErr);
    return { count: 0, oldestDays: null };
  }

  if (orders.length === 0) return { count: 0, oldestDays: null };

  const now = Date.now();
  const oldestMs = Math.max(
    ...orders.map((o) => now - new Date(o.created_at as string).getTime()),
  );

  return { count: orders.length, oldestDays: Math.floor(oldestMs / (24 * 60 * 60 * 1000)) };
}
