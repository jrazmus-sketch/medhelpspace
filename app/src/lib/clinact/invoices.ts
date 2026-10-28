import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscriptionsEnv, listInvoices, type PagBankInvoice } from "@/lib/pagbank/subscriptions";
import { referencePeriod } from "./invoice-period";
import type { ClinactPlanKey } from "./plans";

/**
 * Records every PAID ClinAct invoice in `clinact_invoices`, one row per invoice
 * (first charge and each renewal), for the manual NFS-e screen.
 *
 * Called from the code that already reads the invoices — checkout, the renewal
 * reconcile (cron + webhook) — and NEVER allowed to affect it: every failure is
 * swallowed and logged. A missed write is caught by the next reconcile, since
 * the insert is keyed by PagBank's invoice id and only ever adds what is new
 * (ON CONFLICT DO NOTHING), so it can never overwrite a nota already recorded
 * by hand.
 */
export async function recordPaidInvoices(
  userId: string,
  subscriptionId: string,
  invoices: PagBankInvoice[],
): Promise<void> {
  try {
    const paid = invoices.filter((i) => i.status === "PAID");
    if (paid.length === 0) return;

    const admin = createAdminClient();
    // The tomador (cardholder) and plan come from the subscription row, so a
    // renewal carries the data typed at checkout.
    const { data: sub } = await admin
      .from("clinact_subscriptions")
      .select("plan_key, billing_name, billing_tax_id, billing_phone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub) return;
    const planKey = sub.plan_key as ClinactPlanKey;

    const rows = paid.map((inv) => {
      const billedAt = inv.created_at ?? inv.updated_at ?? new Date().toISOString();
      const period = referencePeriod(billedAt, planKey);
      return {
        id: inv.id,
        user_id: userId,
        subscription_id: subscriptionId,
        plan_key: planKey,
        occurrence: inv.occurrence ?? 1,
        amount_cents: inv.amount?.value ?? 0,
        billed_at: billedAt,
        paid_at: inv.updated_at ?? billedAt,
        period_start: period.start,
        period_end: period.end,
        environment: getSubscriptionsEnv(),
        billing_name: (sub.billing_name as string | null) ?? null,
        billing_tax_id: (sub.billing_tax_id as string | null) ?? null,
        billing_phone: (sub.billing_phone as string | null) ?? null,
      };
    });

    const { error } = await admin
      .from("clinact_invoices")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) console.error("clinact invoices: record failed", subscriptionId, error);
  } catch (err) {
    console.error("clinact invoices: record failed", subscriptionId, err);
  }
}

/** Same, for a caller that has not listed the invoices itself. */
export async function recordPaidInvoicesFor(userId: string, subscriptionId: string): Promise<void> {
  try {
    const { invoices } = await listInvoices(subscriptionId);
    await recordPaidInvoices(userId, subscriptionId, invoices ?? []);
  } catch (err) {
    console.error("clinact invoices: list failed", subscriptionId, err);
  }
}
