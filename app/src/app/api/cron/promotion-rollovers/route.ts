import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { alertCronFailure } from "@/lib/admin/cron-alert";

// Launch-condition rollover (schema-patch-cohort-promotions.sql).
//
// A buyer who bought the promo turma (2027.1) inside the window holds ONE
// membership row flagged rollover_to_cohort_id. apply_promotion_rollovers() moves
// every flagged row whose turma closes within the next day onto the target turma
// (2027.2), keeping joined_at. The dashboard, the 60D countdown and the study plan
// all read the member's turma, so they switch to the September exam on their own.
//
// Timing: 2027.1's access ends 2027-06-04 00:00 UTC (21:00 BRT on 03/06). This runs
// at 23:00 UTC, so the run on 03/06 moves everyone one hour before access would
// lapse. If a run is missed, requireActiveMembership moves the user on their next
// visit instead of sending them to /loja (applyDueRolloverFor).
//
// Idempotent: a moved row has no flag left, so re-running is a no-op.
// Schedule: app/vercel.json. Auth: "Authorization: Bearer <CRON_SECRET>".

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  try {
    const { data, error } = await admin.rpc("apply_promotion_rollovers");
    if (error) throw error;
    const rows = (data ?? []) as { out_result: string }[];
    const moved = rows.filter((r) => r.out_result === "moved").length;
    const alreadyMember = rows.filter((r) => r.out_result === "already_member").length;
    return NextResponse.json({ ok: true, moved, alreadyMember });
  } catch (err) {
    await alertCronFailure("promotion-rollovers", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
