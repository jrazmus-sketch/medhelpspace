import { sendPurchaseConfirmation } from "@/lib/email";
import { recordAdminAlert, formatBRL, paymentMethodLabel } from "@/lib/admin-notify";
import type { PagBankCharge } from "./types";

// Race-safe transition of an order to 'paid' with idempotent membership
// provisioning and one-and-only-one purchase email. Safe to invoke concurrently
// from the webhook, the Pix status poll, and the charge-create immediate-paid
// branch — only the first caller wins each side effect.
//
// The safety mechanisms:
//   0. Amount reconciliation: the settled charge value must equal the order's
//      stored amount_cents, else we bail BEFORE any state-flip/grant (fail safe).
//   1. UPDATE ... WHERE status != 'paid' returns 0 rows for losers, so only
//      the winner runs provisioning + email.
//   2. INSERT into email_log (UNIQUE on user_id+kind+context_id) makes a
//      duplicate purchase email impossible even if (1) is bypassed.
export async function finalizePaidOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  args: {
    orderId: string;
    userId: string;
    cohortId: number;
    charge: PagBankCharge;
  },
): Promise<{ wonRace: boolean }> {
  const { orderId, userId, cohortId, charge } = args;

  // Amount reconciliation (fail safe): never grant membership unless the amount
  // PagBank actually settled equals the amount we recorded on the order. Both
  // sides are integer cents (centavos) — order.amount_cents is stored in cents
  // (see charge route) and PagBankCharge.amount.value is documented as centavos
  // in types.ts. A mismatch means a tampered/underpaid charge; we bail before
  // flipping state so the order stays un-granted for manual review.
  const { data: orderRow, error: loadErr } = await admin
    .from("orders")
    .select("amount_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (loadErr || !orderRow) {
    console.error("finalizePaidOrder: order load failed", orderId, loadErr);
    return { wonRace: false };
  }

  const expectedCents = orderRow.amount_cents as number;
  const paidCents = charge.amount?.value;
  if (paidCents !== expectedCents) {
    console.error(
      "finalizePaidOrder: amount mismatch — refusing to grant",
      "orderId=",
      orderId,
      "expected_amount_cents=",
      expectedCents,
      "charged_value=",
      paidCents,
    );
    // Alert admins: this charge settled for a different amount than the order, so
    // access was NOT granted and the order is held for manual review. Without this
    // the only trace is the console.error above — invisible in production.
    const [{ data: mp }, { data: mc }] = await Promise.all([
      admin.from("profiles").select("email").eq("id", userId).maybeSingle(),
      admin.from("cohorts").select("name").eq("id", cohortId).maybeSingle(),
    ]);
    await recordAdminAlert({
      event: "payment_problem",
      title: `Pagamento retido — valor divergente (pago ${formatBRL(paidCents ?? 0)} vs esperado ${formatBRL(expectedCents)})`,
      body: "Cobrança liquidada com valor diferente do pedido; acesso não liberado.",
      metadata: {
        order_id: orderId,
        expected_cents: expectedCents,
        paid_cents: paidCents ?? null,
        buyer_email: (mp?.email as string | null) ?? null,
        cohort: (mc?.name as string | null) ?? null,
      },
      contextId: orderId,
      emailVars: {
        buyerEmail: (mp?.email as string | null) ?? "—",
        cohortName: (mc?.name as string | null) ?? "—",
        expectedAmount: formatBRL(expectedCents),
        paidAmount: formatBRL(paidCents ?? 0),
        orderId,
      },
    }).catch((e) => console.error("admin payment_problem alert failed", orderId, e));
    return { wonRace: false };
  }

  const { data: winners, error: updErr } = await admin
    .from("orders")
    .update({
      status: "paid",
      // Persist the settled charge id (CHAR_…) so refunds work later. The card
      // path also sets this at charge-create time, but the Pix/Orders-API path
      // only learns the charge id here, once a PAID charge appears on the order.
      pagbank_charge_id: charge.id,
      pagbank_response: charge as unknown as Record<string, unknown>,
    })
    .eq("id", orderId)
    .neq("status", "paid")
    .select("id");

  if (updErr) {
    console.error("finalizePaidOrder: order update failed", orderId, updErr);
    return { wonRace: false };
  }
  if (!winners || winners.length === 0) {
    return { wonRace: false };
  }

  await admin
    .from("user_cohort_memberships")
    .upsert(
      { user_id: userId, cohort_id: cohortId },
      { onConflict: "user_id,cohort_id" },
    );

  // §6.5 Guarantee A (FREE-FUNNEL-BUILD-SPEC): a purchase removes the buyer from
  // the lead drip, so an early R$3.290 buyer never receives the deeper R$2.990
  // last-minute email. Matched by email (leads has no user_id; stored lowercased).
  // Best-effort — a failure here must never affect the grant.
  try {
    const { data: buyer } = await admin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    const buyerEmail = (buyer?.email as string | null)?.toLowerCase();
    if (buyerEmail) {
      await admin
        .from("leads")
        .update({ drip_status: "converted", converted_at: new Date().toISOString() })
        .eq("email", buyerEmail)
        .neq("drip_status", "converted");
    }
  } catch (e) {
    console.error("lead convert flip failed", orderId, e);
  }

  // Email idempotency: UNIQUE (user_id, kind, context_id) on email_log means
  // the second insert with the same context_id (order id) fails — never sends.
  const { error: logErr } = await admin
    .from("email_log")
    .insert({ user_id: userId, kind: "purchase", context_id: orderId });

  if (logErr) {
    // 23505 = unique_violation → email already sent for this order; skip.
    if (logErr.code !== "23505") {
      console.error("email_log insert failed (purchase)", orderId, logErr);
    }
    return { wonRace: true };
  }

  const [{ data: profile }, { data: cohort }] = await Promise.all([
    admin.from("profiles").select("email, display_name").eq("id", userId).single(),
    admin.from("cohorts").select("name").eq("id", cohortId).single(),
  ]);

  if (profile?.email) {
    // AWAIT the send — do NOT fire-and-forget. This runs on Vercel serverless,
    // where the function is frozen the instant the route handler returns its
    // response; an un-awaited Resend HTTP call is cut off mid-flight and never
    // completes unless a later invocation happens to thaw the same warm
    // container. That's the exact reason Pix purchases delivered (the QR screen
    // keeps polling /status, thawing the container) while one-shot credit-card
    // charges logged the email but never sent it. Awaiting keeps the function
    // alive until Resend actually accepts the message.
    const sendResult = await sendPurchaseConfirmation({
      to: profile.email as string,
      name: (profile.display_name as string | null) ?? "",
      cohortName: (cohort?.name as string | null) ?? "",
    }).catch((err) => {
      console.error("Purchase email send threw:", orderId, err);
      return { ok: false as const, reason: "send_threw" };
    });

    if (!sendResult.ok) {
      // The email_log row is a "this purchase email was handled" claim that
      // dedupes concurrent finalizers. The send actually failed, so release the
      // claim — otherwise the row lies (says sent when it wasn't) and the admin
      // "resend" tool / any retry path would be deduped into silence.
      console.error("Purchase email not sent:", orderId, sendResult.reason);
      await admin
        .from("email_log")
        .delete()
        .eq("user_id", userId)
        .eq("kind", "purchase")
        .eq("context_id", orderId);
    }
  }

  // Alert admins of the new paid order — instant emails to opted-in admins, plus a
  // row in admin_alerts for the daily digest. Keyed on the order id so concurrent
  // finalizers fire it once. Best-effort: a failed alert never affects the grant.
  const buyerName =
    ((profile?.display_name as string | null) ||
      (profile?.email as string | null)?.split("@")[0] ||
      "Novo aluno") as string;
  await recordAdminAlert({
    event: "new_purchase",
    title: `Nova compra — ${cohort?.name ?? "turma"} (${formatBRL(expectedCents)})`,
    body: `${buyerName} entrou na turma ${cohort?.name ?? ""}.`,
    metadata: {
      order_id: orderId,
      user_id: userId,
      cohort: (cohort?.name as string | null) ?? null,
      amount_cents: expectedCents,
      payment_method: charge.payment_method?.type ?? null,
    },
    contextId: orderId,
    emailVars: {
      buyerName,
      buyerEmail: (profile?.email as string | null) ?? "—",
      cohortName: (cohort?.name as string | null) ?? "—",
      amount: formatBRL(expectedCents),
      paymentMethod: paymentMethodLabel(charge.payment_method?.type),
      orderId,
    },
  }).catch((e) => console.error("admin new_purchase alert failed", orderId, e));

  return { wonRace: true };
}
