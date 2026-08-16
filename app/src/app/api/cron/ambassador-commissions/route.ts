import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { alertCronFailure } from "@/lib/admin/cron-alert";
import { todayKeyBR } from "@/lib/br-date";

// Ambassador commission release — the 30-day hold expiring (Contrato, cl. 5.1).
//
// A commission is created 'pendente' by the DB trigger the moment its order
// settles, carrying release_on = date of sale + 30 days. This cron is the only
// thing that moves it to 'liberada', which is what makes it eligible for the
// monthly repasse (cl. 7.5).
//
// Why 30 days and not the 7-day guarantee: the buyer's right of regret is 7 days,
// but a card chargeback can land up to ~90 days out. Once a commission is paid we
// can only claw it back out of FUTURE commissions (cl. 6), and in a pilot where
// most ambassadors make one to three sales there usually are none — so the money
// is simply gone. Holding 30 days costs the ambassador nothing in practice (the
// monthly cycle plus the NFS-e requirement means payment lands on the same date
// either way) and covers the window where most reversals actually appear.
//
// Dates come from lib/br-date.ts, never `new Date().toISOString()`. Vercel runs
// UTC; after 21:00 BRT the server is already on tomorrow, which would release
// every commission a day early — on the wrong side of a boundary we chose
// deliberately.
//
// Schedule: app/vercel.json. Auth: "Authorization: Bearer <CRON_SECRET>".

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Generous but bounded: at pilot scale a run handles a handful of rows. The cap
// only exists so a backlog (e.g. the cron paused for a week) can't produce one
// enormous update; the remainder is picked up by the next run, oldest first.
const MAX_ROWS = 500;

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

  const admin = createAdminClient();
  const today = todayKeyBR();

  try {
    // Embed the order so its CURRENT status can be re-checked. The trigger already
    // cancels a commission when its order is refunded, so this is belt-and-braces
    // — but releasing money is a one-way door, and a hand-edited or
    // trigger-missed row is exactly the case worth catching before payout rather
    // than after.
    const { data: due, error } = await admin
      .from("commissions")
      .select("id, ambassador_id, amount_cents, order_id, release_on, orders(status)")
      .eq("status", "pendente")
      .lte("release_on", today)
      .order("release_on", { ascending: true })
      .limit(MAX_ROWS);

    if (error) throw error;

    const released: number[] = [];
    const heldBackOrderIds: string[] = [];

    for (const row of due ?? []) {
      // Supabase types an embedded to-one relation as object|array depending on
      // the shape it infers; normalise before reading.
      const embedded = (row as { orders?: { status?: string } | { status?: string }[] }).orders;
      const orderStatus = Array.isArray(embedded) ? embedded[0]?.status : embedded?.status;

      // An adjustment row has no order and is never 'pendente', so anything here
      // without a paid order is an anomaly, not a normal case.
      if (orderStatus !== "paid") {
        heldBackOrderIds.push(String(row.order_id));
        continue;
      }
      released.push(row.id as number);
    }

    let releasedCount = 0;
    if (released.length > 0) {
      // Re-assert status = 'pendente' in the WHERE clause so a concurrent run (or
      // an admin acting in the panel between the read and the write) can't double-
      // release or resurrect a row someone just cancelled.
      const { data: updated, error: updateError } = await admin
        .from("commissions")
        .update({ status: "liberada", released_at: new Date().toISOString() })
        .in("id", released)
        .eq("status", "pendente")
        .select("id");

      if (updateError) throw updateError;
      releasedCount = updated?.length ?? 0;
    }

    if (heldBackOrderIds.length > 0) {
      console.warn(
        "ambassador-commissions: held back commissions whose order is no longer paid —",
        heldBackOrderIds.join(", "),
      );
    }

    return NextResponse.json({
      ok: true,
      today_br: today,
      due: due?.length ?? 0,
      released: releasedCount,
      held_back: heldBackOrderIds.length,
    });
  } catch (err) {
    await alertCronFailure("ambassador-commissions", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
