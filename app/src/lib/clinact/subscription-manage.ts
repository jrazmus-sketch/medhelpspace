import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelSubscription,
  customerCardToken,
  getSubscriptionsEnv,
  retrySubscriptionCharge,
  setCustomerCard,
  type PagBankAuditEntry,
} from "@/lib/pagbank/subscriptions";
import { reconcileClinactSubscription } from "./renewals";

/**
 * What a subscriber can do to their own subscription: cancel it, and change
 * the card on file.
 *
 * OWNERSHIP IS STRUCTURAL. Every function takes the signed-in user's id and
 * finds the subscription through THEIR row in clinact_subscriptions. There is
 * no parameter for a subscription or customer id, so there is nothing to
 * tamper with — the lesson of the CPF lookup, which trusted an identifier the
 * caller could choose.
 */

type OwnRow = {
  reference_id: string;
  pagbank_subscription_id: string | null;
  pagbank_customer_id: string | null;
  status: string | null;
};

async function ownSubscription(userId: string): Promise<OwnRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinact_subscriptions")
    .select("reference_id, pagbank_subscription_id, pagbank_customer_id, status")
    .eq("user_id", userId)
    .eq("environment", getSubscriptionsEnv())
    .maybeSingle();
  return (data as OwnRow | null) ?? null;
}

function auditFor(userId: string, referenceId: string) {
  const env = getSubscriptionsEnv();
  return async (entry: PagBankAuditEntry) => {
    await createAdminClient().from("pagbank_subscription_api_calls").insert({
      user_id: userId,
      reference_id: referenceId,
      environment: env,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      request: entry.request as Record<string, unknown> | null,
      response: entry.response as Record<string, unknown> | null,
    });
  };
}

export type ManageResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Cancels the subscription. Access is NOT cut: the student keeps what they
 * already paid for, up to paid_until — access only ever moves forward, and
 * cancelling stops the next charge, not the current period.
 */
export async function cancelOwnSubscription(userId: string): Promise<ManageResult> {
  const row = await ownSubscription(userId);
  if (!row?.pagbank_subscription_id) {
    return { ok: false, error: "Não encontramos uma assinatura ativa na sua conta." };
  }
  if (row.status === "CANCELED" || row.status === "EXPIRED") {
    return { ok: true, message: "A sua assinatura já estava cancelada." };
  }

  try {
    await cancelSubscription(row.pagbank_subscription_id);
  } catch {
    return {
      ok: false,
      error: "Não foi possível cancelar agora. Nenhuma alteração foi feita — tente novamente em alguns instantes.",
    };
  }

  // Record the new state from the API, and the date access now ends.
  await reconcileClinactSubscription({
    user_id: userId,
    pagbank_subscription_id: row.pagbank_subscription_id,
  });
  const { data: access } = await createAdminClient()
    .from("user_product_access")
    .select("paid_until")
    .eq("user_id", userId)
    .eq("product", "clinact")
    .maybeSingle();

  const until = access?.paid_until
    ? new Date(access.paid_until as string).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  return {
    ok: true,
    message: until
      ? `Assinatura cancelada. Você continua com acesso até ${until} e não será cobrado de novo.`
      : "Assinatura cancelada. Você não será cobrado de novo.",
  };
}

/**
 * Replaces the card on file with one encrypted in the student's browser.
 *
 * No CVV here: PUT billing_info takes the encrypted blob alone. If the
 * subscription is waiting on a failed charge, the new card is charged right
 * away with a manual retry instead of waiting for PagBank's own schedule —
 * PagBank allows one of those per subscription per day.
 */
export async function updateOwnCard(userId: string, encryptedCard: string): Promise<ManageResult> {
  const row = await ownSubscription(userId);
  if (!row?.pagbank_customer_id || !row.pagbank_subscription_id) {
    return { ok: false, error: "Não encontramos uma assinatura na sua conta." };
  }
  const audit = auditFor(userId, row.reference_id);

  let card: { brand?: string; last?: string } | null = null;
  try {
    const updated = await setCustomerCard(row.pagbank_customer_id, encryptedCard, audit);
    if (!customerCardToken(updated)) throw new Error("no token");
    const registered = updated.billing_info?.[0]?.card;
    card = registered ? { brand: registered.brand, last: registered.last_digits } : null;
  } catch {
    return {
      ok: false,
      error: "O PagBank não aceitou este cartão. Confira os dados e tente de novo — o cartão anterior continua valendo.",
    };
  }

  await createAdminClient()
    .from("clinact_subscriptions")
    .update({
      card_brand: card?.brand ?? null,
      card_last_digits: card?.last ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  const waitingOnPayment = row.status === "OVERDUE" || row.status === "PENDING_ACTION";
  if (!waitingOnPayment) {
    return { ok: true, message: "Cartão atualizado. As próximas cobranças usam o cartão novo." };
  }

  try {
    await retrySubscriptionCharge(row.pagbank_subscription_id);
  } catch {
    // Already retried today, or PagBank refused the retry. The new card is on
    // file either way, and PagBank's own schedule will charge it.
    return {
      ok: true,
      message:
        "Cartão atualizado. A cobrança pendente será feita no cartão novo na próxima tentativa automática.",
    };
  }
  return {
    ok: true,
    message:
      "Cartão atualizado e cobrança pendente enviada. Assim que o pagamento for confirmado, o seu acesso é liberado.",
  };
}
