import { sendPurchaseConfirmation } from "@/lib/email";
import type { PagBankCharge } from "./types";

// Race-safe transition of an order to 'paid' with idempotent membership
// provisioning and one-and-only-one purchase email. Safe to invoke concurrently
// from the webhook, the Pix status poll, and the charge-create immediate-paid
// branch — only the first caller wins each side effect.
//
// The two safety mechanisms:
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

  const { data: winners, error: updErr } = await admin
    .from("orders")
    .update({
      status: "paid",
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
    sendPurchaseConfirmation({
      to: profile.email as string,
      name: (profile.display_name as string | null) ?? "",
      cohortName: (cohort?.name as string | null) ?? "",
    }).catch((err) => console.error("Purchase email send failed:", err));
  }

  return { wonRace: true };
}
