import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrder } from "@/lib/pagbank/api";
import { finalizePaidOrder } from "@/lib/pagbank/finalize";

// Pending-Pix reconciliation — the closed-tab safety net.
//
// Card payments finalize synchronously in /api/pagbank/charge, and a Pix buyer who
// keeps the tab open finalizes via the 5s status poll. The ONLY thing that grants a
// closed-tab Pix buyer their membership is the PagBank webhook — and if that webhook
// is dropped (e.g. the signature format doesn't verify and PAGBANK_WEBHOOK_ENFORCE is
// on), the buyer pays but never gets access, with nothing to recover it.
//
// This cron is that recovery: it re-fetches every still-pending Pix order from PagBank
// and finalizes the ones PagBank reports PAID. It leans entirely on finalizePaidOrder,
// which is idempotent and race-safe — amount reconciliation, UPDATE ... WHERE status !=
// 'paid', and the email_log UNIQUE guard mean a row already settled by the webhook or
// the status poll is a no-op here (wonRace=false, no double-grant, no double-email).
//
// Schedule: app/vercel.json. Auth: "Authorization: Bearer <CRON_SECRET>" (Vercel sends it).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-check window. A Pix QR is only payable for 30 min, but a payment made in that
// window can land on PagBank's side after our recording lagged or a webhook was missed
// — and a webhook outage can span hours. Re-checking orders created within this window
// catches all of that; past it, a still-pending order is treated as abandoned and left
// alone (if it had paid, an earlier run inside the window would have caught it).
const LOOKBACK_HOURS = 72;

// Bound the fan-out so one run can't balloon into hundreds of PagBank calls. Pending
// Pix orders are dominated by abandoned QRs, which we harmlessly re-poll until they age
// out of the window; the cap keeps that cost flat. Oldest-first so nothing starves.
const MAX_ORDERS = 100;

export async function GET(request: NextRequest) {
  // Vercel Cron auth: Bearer header must match CRON_SECRET (timing-safe, mirrors
  // the lifecycle-notifications cron).
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(authHeader ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();

  const { data: orders, error } = await admin
    .from("orders")
    .select("id, user_id, cohort_id, pagbank_order_id, status")
    .eq("payment_method", "pix")
    .eq("status", "pending")
    .not("pagbank_order_id", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(MAX_ORDERS);

  if (error) {
    console.error("reconcile-pix: order query failed", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  let checked = 0;
  let finalized = 0;
  let stillPending = 0;
  let errored = 0;

  for (const order of orders ?? []) {
    checked++;
    const pbOrderId = order.pagbank_order_id as string;
    try {
      const pbOrder = await getOrder(pbOrderId);
      // The order's charges[] is empty until the QR is paid; a PAID entry is the
      // settled payment. Anything else (waiting, declined) → leave it pending.
      const paid = pbOrder.charges?.find((c) => c.status === "PAID");
      if (!paid) {
        stillPending++;
        continue;
      }
      const { wonRace } = await finalizePaidOrder(admin, {
        orderId: order.id as string,
        userId: order.user_id as string,
        cohortId: order.cohort_id as number,
        charge: paid,
      });
      if (wonRace) {
        finalized++;
        console.warn(
          "reconcile-pix: recovered a paid Pix order missed by the webhook/poll —",
          "orderId=", order.id, "pagbank_order_id=", pbOrderId,
        );
      }
    } catch (err) {
      errored++;
      console.error("reconcile-pix: failed for order", order.id, pbOrderId, err);
    }
  }

  return NextResponse.json({
    ok: true,
    window_hours: LOOKBACK_HOURS,
    checked,
    finalized,
    still_pending: stillPending,
    errored,
  });
}
