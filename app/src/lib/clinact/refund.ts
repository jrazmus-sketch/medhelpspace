import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAlert, formatBRL } from "@/lib/admin-notify";
import {
  cancelSubscription,
  getSubscription,
  getSubscriptionsEnv,
  idempotencyKey,
  isAlreadyRefunded,
  isIdempotencyConflict,
  listPayments,
  paymentToRefund,
  refundPayment,
  PagBankSubscriptionsError,
  type PagBankAuditEntry,
} from "@/lib/pagbank/subscriptions";

/**
 * The "Reembolsar" button of a ClinAct invoice (Karina 2026-11-02): ONE action
 * that, in this order,
 *
 *   1. cancels the invoice's subscription — FIRST, so a refund can never be
 *      followed by another charge (a cancelled subscription is never extended
 *      by the renewal cron either: renewalDecision → "ended");
 *   2. refunds the invoice's APPROVED payment, in full, on PagBank;
 *   3. ends ClinAct access now — only when this invoice belongs to the
 *      student's CURRENT subscription (refunding an old subscription's invoice
 *      must not take away a newer one's access);
 *   4. records the refund on the invoice: when, which admin, PagBank's REFU_ id.
 *
 * Re-running is safe at every step: a claim column lets only one request in;
 * cancel is skipped when already cancelled; a payment already refunded (lost
 * response, or refunded in the PagBank panel) is recorded instead of failing.
 *
 * The one exception to "paid_until only moves forward": a refund is the student
 * giving the period back, so access ends with it.
 */

// A claim older than this is treated as abandoned (the request died between
// claiming and finishing) — same window as the Revalida refund.
const CLAIM_STALE_MS = 10 * 60 * 1000;
const ENDED = ["CANCELED", "EXPIRED"];

export type RefundResult =
  | { ok: true; refundedAt: string; accessRevoked: boolean; alreadyRefunded: boolean }
  | { ok: false; status: number; error: string };

function pagbankDetail(e: unknown): string {
  if (!(e instanceof PagBankSubscriptionsError)) return "";
  const messages = (e.body as { error_messages?: { description?: string; parameter_name?: string }[] })
    ?.error_messages;
  return (messages ?? [])
    .map((m) => [m.parameter_name, m.description].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
}

export async function refundClinactInvoice(invoiceId: string, actorId: string): Promise<RefundResult> {
  const admin = createAdminClient();
  const env = getSubscriptionsEnv();

  const { data: invoice } = await admin
    .from("clinact_invoices")
    .select("id, user_id, subscription_id, plan_key, amount_cents, environment, refunded_at")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, status: 404, error: "Cobrança não encontrada." };
  if (invoice.refunded_at) return { ok: false, status: 409, error: "Esta cobrança já foi reembolsada." };
  if (invoice.environment !== env) {
    return { ok: false, status: 409, error: "Esta cobrança é de outro ambiente do PagBank." };
  }
  if (!((invoice.amount_cents as number) > 0)) {
    return { ok: false, status: 409, error: "Cobrança sem valor — não há o que estornar." };
  }

  const userId = invoice.user_id as string;
  const subscriptionId = invoice.subscription_id as string;

  // Claim BEFORE touching money: a double click or two admins both read
  // "not refunded"; only one can move the claim from empty.
  const staleClaim = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
  const { data: claimed } = await admin
    .from("clinact_invoices")
    .update({ refund_claimed_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .is("refunded_at", null)
    .or(`refund_claimed_at.is.null,refund_claimed_at.lt.${staleClaim}`)
    .select("id");
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: "Esta cobrança já está sendo reembolsada." };
  }
  const release = () => admin.from("clinact_invoices").update({ refund_claimed_at: null }).eq("id", invoiceId);

  const { data: current } = await admin
    .from("clinact_subscriptions")
    .select("reference_id, pagbank_subscription_id")
    .eq("user_id", userId)
    .eq("environment", env)
    .maybeSingle();
  const isCurrent = current?.pagbank_subscription_id === subscriptionId;

  // Every PagBank call of this refund goes to the same log as checkout's.
  const audit = async (entry: PagBankAuditEntry) => {
    await admin.from("pagbank_subscription_api_calls").insert({
      user_id: userId,
      reference_id: (current?.reference_id as string | undefined) ?? `refund-${invoiceId}`,
      environment: env,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      request: entry.request as Record<string, unknown> | null,
      response: entry.response as Record<string, unknown> | null,
    });
  };

  // 1. Cancel the subscription — before any money moves.
  let subscriptionCancelled = false;
  try {
    const subscription = await getSubscription(subscriptionId);
    if (!ENDED.includes(subscription.status)) {
      await cancelSubscription(subscriptionId, audit);
      subscriptionCancelled = true;
    }
  } catch (e) {
    await release();
    console.error("clinact refund: cancel failed", invoiceId, e);
    return {
      ok: false,
      status: 502,
      error: "Não foi possível cancelar a assinatura no PagBank. Nada foi estornado — tente de novo.",
    };
  }
  if (isCurrent) {
    await admin
      .from("clinact_subscriptions")
      .update({ status: "CANCELED", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("pagbank_subscription_id", subscriptionId);
  }

  // 2. Refund the approved payment.
  let refundId: string | null = null;
  let alreadyRefunded = false;
  try {
    const target = paymentToRefund((await listPayments(invoiceId)).payments ?? []);
    if (target.kind === "none") {
      await release();
      return {
        ok: false,
        status: 409,
        error: "Não há pagamento aprovado nesta cobrança. A assinatura foi cancelada; nada foi estornado.",
      };
    }
    if (target.kind === "already") {
      alreadyRefunded = true;
    } else {
      try {
        const refund = await refundPayment(
          target.id,
          invoice.amount_cents as number,
          idempotencyKey("clinactrefund", invoiceId),
          audit,
        );
        refundId = refund.id;
      } catch (e) {
        // A lost response retried, or a refund made in the PagBank panel: the
        // money is back — confirm by reading the payment, then record it.
        if (!isIdempotencyConflict(e) && !isAlreadyRefunded(e)) throw e;
        const again = paymentToRefund((await listPayments(invoiceId)).payments ?? []);
        if (again.kind !== "already") throw e;
        alreadyRefunded = true;
      }
    }
  } catch (e) {
    await release();
    console.error("clinact refund: refund failed", invoiceId, e);
    const detail = pagbankDetail(e);
    return {
      ok: false,
      status: 502,
      error: `PagBank recusou o estorno${detail ? ` — ${detail}` : ""}. A assinatura ${
        subscriptionCancelled ? "foi cancelada" : "já estava cancelada"
      }; tente o estorno de novo.`,
    };
  }

  // 3. End access — only for the student's current subscription.
  const refundedAt = new Date().toISOString();
  let accessRevoked = false;
  if (isCurrent) {
    const { data: revoked } = await admin
      .from("user_product_access")
      .update({ paid_until: refundedAt, updated_at: refundedAt })
      .eq("user_id", userId)
      .eq("product", "clinact")
      .gt("paid_until", refundedAt)
      .select("user_id");
    accessRevoked = (revoked ?? []).length > 0;
  }

  // 4. Record it on the invoice — the fiscal screen's "Reembolsada".
  await admin
    .from("clinact_invoices")
    .update({ refunded_at: refundedAt, refunded_by: actorId, refund_id: refundId, refund_claimed_at: null })
    .eq("id", invoiceId);

  // Audit + alert: best-effort, the money has already moved.
  const { error: auditErr } = await admin.from("admin_audit_log").insert({
    actor_user_id: actorId,
    action: "clinact_invoice_refunded",
    target_user_id: userId,
    details: {
      invoice_id: invoiceId,
      subscription_id: subscriptionId,
      refund_id: refundId,
      already_refunded_on_pagbank: alreadyRefunded,
      amount_cents: invoice.amount_cents,
      subscription_cancelled: subscriptionCancelled,
      access_revoked: accessRevoked,
      current_subscription: isCurrent,
    },
  });
  if (auditErr) console.error("clinact refund audit failed", invoiceId, auditErr);

  try {
    const [{ data: buyer }, { data: actor }] = await Promise.all([
      admin.from("profiles").select("email, display_name").eq("id", userId).maybeSingle(),
      admin.from("profiles").select("email, display_name").eq("id", actorId).maybeSingle(),
    ]);
    const nameOf = (p: { email?: unknown; display_name?: unknown } | null, fallback: string) =>
      ((p?.display_name as string | null) || (p?.email as string | null)?.split("@")[0] || fallback) as string;
    const product = `ClinAct — plano ${invoice.plan_key as string}`;
    const amount = formatBRL(invoice.amount_cents as number);
    await recordAdminAlert({
      event: "refund",
      title: `Estorno — ${product} (${amount})`,
      body: `${nameOf(actor, "Admin")} estornou a assinatura de ${nameOf(buyer, "Aluno")}.`,
      metadata: { invoice_id: invoiceId, refund_id: refundId, amount_cents: invoice.amount_cents, actor_user_id: actorId },
      contextId: invoiceId,
      emailVars: {
        buyerName: nameOf(buyer, "Aluno"),
        buyerEmail: (buyer?.email as string | null) ?? "—",
        cohortName: product,
        amount,
        actorName: nameOf(actor, "Admin"),
        reason: "—",
        orderId: invoiceId,
      },
    });
  } catch (e) {
    console.error("clinact refund alert failed", invoiceId, e);
  }

  return { ok: true, refundedAt, accessRevoked, alreadyRefunded };
}
