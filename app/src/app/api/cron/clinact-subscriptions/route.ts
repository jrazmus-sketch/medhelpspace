import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { alertCronFailure } from "@/lib/admin/cron-alert";
import { getSubscriptionsEnv } from "@/lib/pagbank/subscriptions";
import { reconcileClinactSubscription } from "@/lib/clinact/renewals";

// ClinAct renewals — keeps each subscriber's access in step with what PagBank
// actually charged.
//
// THE SOURCE OF TRUTH, not a backup. PagBank sends no payment-level webhook:
// in sandbox a successful charge produced no "paid" event at all, and a
// recovered charge arrived as a second subscription.initial. So the only
// reliable way to learn that month two was paid is to ask. This runs daily and
// asks, for every subscription that has not ended; the webhook route calls the
// same code as a fast path.
//
// Safe to run any number of times: access only ever moves forward
// (grantAccess), and a failed read changes nothing.
//
// Schedule: app/vercel.json, 07:00 UTC (04:00 BRT) — after most overnight
// charges settle and before students start their day.
// Auth: "Authorization: Bearer <CRON_SECRET>", like every other cron here.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PagBank is called twice per row. At launch scale this is a handful; the cap
// only stops a large backlog from overrunning the function — the rest is taken
// by the next run, least recently checked first.
const MAX_ROWS = 200;

// Statuses where nothing can change any more. Everything else is re-read.
const ENDED = ["CANCELED", "EXPIRED"];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(authHeader ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("clinact_subscriptions")
      .select("user_id, pagbank_subscription_id, status")
      .not("pagbank_subscription_id", "is", null)
      // Only this deployment's environment: sandbox ids are meaningless to the
      // production API and would just fail.
      .eq("environment", getSubscriptionsEnv())
      .order("updated_at", { ascending: true })
      .limit(MAX_ROWS);
    if (error) throw error;

    const live = (rows ?? []).filter((r) => !ENDED.includes(String(r.status ?? "")));

    const summary = { checked: 0, extended: 0, held: 0, errors: 0 };
    // Sequential on purpose: two calls per row, and PagBank's API is not ours
    // to hammer.
    for (const row of live) {
      const result = await reconcileClinactSubscription({
        user_id: row.user_id as string,
        pagbank_subscription_id: row.pagbank_subscription_id as string,
      });
      summary.checked += 1;
      if (result.decision.action === "extend") summary.extended += 1;
      else if (result.decision.action === "error") summary.errors += 1;
      else summary.held += 1;
    }

    return NextResponse.json({ ok: true, environment: getSubscriptionsEnv(), ...summary });
  } catch (err) {
    await alertCronFailure("clinact-subscriptions", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
