import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/email-render";
import { getSubscriptionsEnv } from "@/lib/pagbank/subscriptions";
import { addDaysKey, toDateKeyBR, todayKeyBR } from "@/lib/br-date";
import {
  CLINACT_PLANS,
  chargeSchedule,
  formatBRL,
  perPeriod,
  storedOffer,
  type ClinactPlanKey,
} from "./plans";

/**
 * The two ClinAct subscription e-mails (Black Friday launch, Karina 2026-10-29):
 *
 *   - confirmation, when the first charge is paid — states what was charged
 *     and what every later charge will be;
 *   - the annual renewal notice, RENEWAL_NOTICE_DAYS before the first renewal
 *     of a promotional annual subscription, which renews at the normal price.
 *
 * ONCE PER SUBSCRIPTION, by claim: each marker column holds the PagBank
 * subscription id it was sent for, and is claimed with a conditional UPDATE
 * before sending — so the checkout, the webhook and the cron can all call this
 * and only one e-mail goes out. A new subscription (new id) is a new e-mail,
 * with no reset to forget. A failed send releases the claim for the next run.
 *
 * Every amount and date comes from the subscription row + lib/clinact/plans.ts.
 * Never throws: an e-mail must not cost a student their subscription.
 */

/** How long before the first annual renewal the notice goes out. */
export const RENEWAL_NOTICE_DAYS = 15;

const SUB_COLUMNS =
  "user_id, plan_key, pagbank_subscription_id, status, promotion_key, promo_amount_cents, promo_cycles, confirmation_sent_for, renewal_notice_sent_for";

type SubRow = {
  user_id: string;
  plan_key: ClinactPlanKey;
  pagbank_subscription_id: string | null;
  status: string | null;
  promotion_key: string | null;
  promo_amount_cents: number | null;
  promo_cycles: number | null;
  confirmation_sent_for: string | null;
  renewal_notice_sent_for: string | null;
};

function dateBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function recipient(userId: string): Promise<{ email: string; displayName: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email, display_name").eq("id", userId).maybeSingle();
  const email = (data?.email as string | null) ?? "";
  if (!email) return null;
  const first = ((data?.display_name as string | null) ?? "").trim().split(/\s+/)[0] || email.split("@")[0];
  return { email, displayName: escapeHtml(first) };
}

async function paidUntil(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_product_access")
    .select("paid_until")
    .eq("user_id", userId)
    .eq("product", "clinact")
    .maybeSingle();
  return (data?.paid_until as string | null) ?? null;
}

/** Claims `column` for this subscription; true when THIS call won the claim. */
async function claim(row: SubRow, column: "confirmation_sent_for" | "renewal_notice_sent_for"): Promise<boolean> {
  const id = row.pagbank_subscription_id;
  if (!id) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clinact_subscriptions")
    .update({ [column]: id })
    .eq("user_id", row.user_id)
    .eq("pagbank_subscription_id", id)
    .or(`${column}.is.null,${column}.neq.${id}`)
    .select("user_id");
  return !error && (data?.length ?? 0) > 0;
}

async function release(row: SubRow, column: "confirmation_sent_for" | "renewal_notice_sent_for"): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("clinact_subscriptions")
    .update({ [column]: null })
    .eq("user_id", row.user_id)
    .eq("pagbank_subscription_id", row.pagbank_subscription_id ?? "");
}

/**
 * The confirmation e-mail, once per subscription. Call it whenever access has
 * just been granted for a first charge — the checkout (paid on the spot) and
 * the reconcile (a pending charge that cleared later) both do.
 */
export async function sendSubscriptionConfirmation(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("clinact_subscriptions")
      .select(SUB_COLUMNS)
      .eq("user_id", userId)
      .eq("environment", getSubscriptionsEnv())
      .maybeSingle();
    const row = data as SubRow | null;
    if (!row?.pagbank_subscription_id || row.confirmation_sent_for === row.pagbank_subscription_id) return;

    const to = await recipient(userId);
    const until = await paidUntil(userId);
    if (!to || !until) return;
    if (!(await claim(row, "confirmation_sent_for"))) return;

    const offer = storedOffer(row.plan_key, row);
    // The second charge is still promotional on the monthly (3 discounted).
    const nextCents = offer.promo_cycles > 1 ? offer.first_cents : offer.normal_cents;
    const res = await sendTemplateEmail({
      kind: "clinact-subscription-confirmed",
      to: to.email,
      vars: {
        displayName: to.displayName,
        planLabel: CLINACT_PLANS[row.plan_key].label,
        promoLine: offer.promotion ? `<strong>${offer.promotion.label}</strong><br/>` : "",
        firstCharge: formatBRL(offer.first_cents),
        nextCharge: `${formatBRL(nextCents)} em ${dateBR(until)}`,
        chargeSchedule: chargeSchedule(offer),
      },
    });
    if (!res.ok) await release(row, "confirmation_sent_for");
  } catch (err) {
    console.error("sendSubscriptionConfirmation failed", err);
  }
}

/**
 * The annual renewal notices due today. Called by the daily renewals cron.
 * Only promotional annual subscriptions are noticed — those are the ones whose
 * first renewal costs more than what the student paid — and only once.
 */
export async function sendDueRenewalNotices(): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("clinact_subscriptions")
      .select(SUB_COLUMNS)
      .eq("environment", getSubscriptionsEnv())
      .eq("plan_key", "anual")
      .not("promotion_key", "is", null)
      .not("pagbank_subscription_id", "is", null)
      .not("status", "in", "(CANCELED,EXPIRED)");
    const rows = ((data ?? []) as SubRow[]).filter(
      (r) => r.renewal_notice_sent_for !== r.pagbank_subscription_id,
    );

    const today = todayKeyBR();
    const horizon = addDaysKey(today, RENEWAL_NOTICE_DAYS);
    for (const row of rows) {
      const until = await paidUntil(row.user_id);
      if (!until) continue;
      const renewalKey = toDateKeyBR(until);
      // Due: the renewal is within the window and has not happened yet.
      if (renewalKey < today || renewalKey > horizon) continue;

      const to = await recipient(row.user_id);
      if (!to) continue;
      if (!(await claim(row, "renewal_notice_sent_for"))) continue;

      const offer = storedOffer(row.plan_key, row);
      const res = await sendTemplateEmail({
        kind: "clinact-renewal-notice",
        to: to.email,
        vars: {
          displayName: to.displayName,
          promoLabel: offer.promotion?.label ?? "condição especial",
          firstCharge: formatBRL(offer.first_cents),
          renewalDate: dateBR(until),
          renewalAmount: `${formatBRL(offer.normal_cents)}${perPeriod(row.plan_key)}`,
        },
      });
      if (res.ok) sent += 1;
      else await release(row, "renewal_notice_sent_for");
    }
  } catch (err) {
    console.error("sendDueRenewalNotices failed", err);
  }
  return { sent };
}
