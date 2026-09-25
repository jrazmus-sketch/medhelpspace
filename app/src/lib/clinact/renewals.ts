import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscription, getSubscriptionsEnv, listInvoices } from "@/lib/pagbank/subscriptions";
import { renewalDecision, type RenewalDecision } from "@/lib/pagbank/subscriptions-core";
import { grantAccess } from "./subscribe";

/**
 * Keeps a ClinAct subscriber's access in step with what PagBank actually
 * charged.
 *
 * Without this, access set at checkout is the only access a student ever gets:
 * PagBank charges month two on its own and our database never hears about it,
 * so a paying subscriber would lose access after their first period. Two
 * callers, deliberately:
 *
 *   - the daily cron (/api/cron/clinact-subscriptions) — the source of truth,
 *     because there is no payment-level webhook to rely on;
 *   - the webhook route — a fast path, so a renewal shows up in minutes rather
 *     than by the next morning.
 *
 * Both only ever act on an authenticated READ from the PagBank API. Nothing
 * here trusts a webhook body, which is what makes it safe to call from a
 * webhook whose signature we cannot yet verify.
 */

export type ReconcileResult = {
  userId: string;
  subscriptionId: string;
  status: string | null;
  decision: RenewalDecision | { action: "error" };
};

export async function reconcileClinactSubscription(row: {
  user_id: string;
  pagbank_subscription_id: string;
}): Promise<ReconcileResult> {
  const admin = createAdminClient();
  const base = { userId: row.user_id, subscriptionId: row.pagbank_subscription_id };

  let subscription;
  let invoices;
  try {
    subscription = await getSubscription(row.pagbank_subscription_id);
    invoices = (await listInvoices(row.pagbank_subscription_id)).invoices ?? [];
  } catch {
    // A PagBank hiccup must never cost a student access: do nothing, and the
    // next run tries again. paid_until only moves forward, so skipping is safe.
    return { ...base, status: null, decision: { action: "error" } };
  }

  const decision = renewalDecision(subscription, invoices);

  // Record what PagBank says now, whatever we decide — this is what the
  // "minha assinatura" screen and support read.
  await admin
    .from("clinact_subscriptions")
    .update({ status: subscription.status, updated_at: new Date().toISOString() })
    .eq("user_id", row.user_id)
    .eq("pagbank_subscription_id", row.pagbank_subscription_id);

  if (decision.action === "extend") {
    // Forward-only inside grantAccess: a stale read can never shorten access.
    await grantAccess(row.user_id, decision.until);
  }

  return { ...base, status: subscription.status, decision };
}

/** The subscription row behind a PagBank id, if it is one of ours. */
export async function findClinactSubscription(
  pagbankSubscriptionId: string,
): Promise<{ user_id: string; pagbank_subscription_id: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinact_subscriptions")
    .select("user_id, pagbank_subscription_id")
    .eq("pagbank_subscription_id", pagbankSubscriptionId)
    // Never act on a row from the other environment: a sandbox subscription id
    // must not be reconciled with production credentials, or vice versa.
    .eq("environment", getSubscriptionsEnv())
    .maybeSingle();
  return (data as { user_id: string; pagbank_subscription_id: string } | null) ?? null;
}
