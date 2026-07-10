import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import {
  offerCheckoutUrl,
  simuladoAccessUrl,
  unsubscribeUrl,
  WELCOME_COUPONS,
  SIMULADO_SOURCE,
  REVALIDA_2026_2_SLUG,
} from "@/lib/magnet/links";
import { alertCronFailure } from "@/lib/admin/cron-alert";

// Welcome + finish drip for the 100-question simulado funnel (source='simulado-100').
// The D0 delivery (magic access link, lead-sim-access) is sent inline at capture
// (chooseSimuladoCohortAndSend); this cron sends two nurture touches, clock from
// completed_at (finished the gate → got the simulado link).
//
// Each step's TEMPLATE is chosen by whether the lead finished the 100 questions
// (sim_completed_at), evaluated at send time:
//   • FINISHER   → lead-sim-d2 (report recap + coupon) then lead-sim-d5 (last call).
//   • NON-FINISHER → lead-sim-finish-1 (come back, no coupon) then lead-sim-finish-2
//     (come back + coupon). The coupon lands exactly once on every path (finish-2 /
//     d5 both carry it), so a mid-way finisher never misses or doubles it.
// Mirrors flashcards-drip's reserve-first claim + buyer exclusion.
// Schedule: app/vercel.json. Auth: Bearer CRON_SECRET.

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIMULADO_SIZE = 100;

const STEPS = [
  { step: 1, offsetDays: 1, finished: "lead-sim-d2", unfinished: "lead-sim-finish-1" },
  { step: 2, offsetDays: 3, finished: "lead-sim-d5", unfinished: "lead-sim-finish-2" },
] as const;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`, "utf8");
  const actual = Buffer.from(request.headers.get("authorization") ?? "", "utf8");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const now = Date.now();

    // Active simulado-funnel leads who completed the gate (got the access link),
    // oldest first, with more steps to send. drip_step is exclusively owned by this
    // cron for these leads — lead-drip and lead-recovery exclude source='simulado-100'.
    const { data: leads } = await admin
      .from("leads")
      .select("id, email, drip_step, completed_at, target_cohort, first_name, result_token, unsubscribe_token, sim_completed_at, sim_progress, sim_score")
      .eq("drip_status", "active")
      .eq("source", SIMULADO_SOURCE)
      .not("completed_at", "is", null)
      .lt("drip_step", STEPS[STEPS.length - 1].step)
      .order("completed_at", { ascending: true })
      .limit(300);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "no active simulado leads due" });
    }

    // Buyer exclusion backstop (mirrors lead-drip): never email someone who bought.
    const { data: memberUsers } = await admin.from("user_cohort_memberships").select("user_id");
    const memberIds = [...new Set((memberUsers ?? []).map((r) => r.user_id as string))];
    let excluded = new Set<string>();
    if (memberIds.length) {
      const { data: memberEmails } = await admin.from("profiles").select("email").in("id", memberIds);
      excluded = new Set(
        (memberEmails ?? [])
          .map((r) => (r.email as string | null)?.toLowerCase())
          .filter((e): e is string => Boolean(e)),
      );
    }

    let sent = 0;
    let skippedBuyer = 0;
    let skippedClaimed = 0;
    let failed = 0;

    for (const lead of leads) {
      const email = (lead.email as string).toLowerCase();
      if (excluded.has(email)) {
        skippedBuyer++;
        continue;
      }

      const currentStep = lead.drip_step as number;
      const nextStep = STEPS.find((s) => s.step === currentStep + 1);
      if (!nextStep) continue;

      const elapsedDays = Math.floor(
        (now - new Date(lead.completed_at as string).getTime()) / 86_400_000,
      );
      if (elapsedDays < nextStep.offsetDays) continue; // not due yet

      const cohort = (lead.target_cohort as string | null) ?? REVALIDA_2026_2_SLUG;
      const welcome = WELCOME_COUPONS[cohort] ?? WELCOME_COUPONS[REVALIDA_2026_2_SLUG];

      // Template branches on whether they finished the 100 questions (at send time).
      const finished = lead.sim_completed_at != null;
      const kind = finished ? nextStep.finished : nextStep.unfinished;
      const answered = lead.sim_progress
        ? Object.keys(lead.sim_progress as Record<string, unknown>).length
        : 0;
      const questionsLeft = Math.max(1, SIMULADO_SIZE - answered);

      const vars: Record<string, string> = {
        greeting: greetingFor(lead.first_name as string | null),
        coupon: welcome.code,
        couponPercent: `${welcome.percent}%`,
        questionsLeft: String(questionsLeft),
        score: String((lead.sim_score as number | null) ?? 0),
        checkoutUrl: offerCheckoutUrl({
          email,
          coupon: welcome.code,
          cohort,
          utmCampaign: kind,
        }),
        accessUrl: simuladoAccessUrl((lead.result_token as string) ?? ""),
        unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
      };

      // Reserve-first conditional claim: advance drip_step only if it still matches
      // what we read, so overlapping runs can't double-send. Reverted on send failure.
      const { data: claimed, error: claimErr } = await admin
        .from("leads")
        .update({ drip_step: nextStep.step, last_emailed_at: new Date().toISOString() })
        .eq("id", lead.id)
        .eq("drip_step", currentStep)
        .select("id");
      if (claimErr) {
        console.error("simulado-drip claim failed", lead.id, claimErr);
        failed++;
        continue;
      }
      if (!claimed || claimed.length === 0) {
        skippedClaimed++;
        continue;
      }

      let res: { ok: boolean; reason?: string };
      try {
        res = await sendTemplateEmail({
          kind,
          to: email,
          vars,
          fromName: FUNNEL_SENDER_NAME,
        });
      } catch (e) {
        res = { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }

      if (res.ok) {
        sent++;
      } else {
        console.error("simulado-drip send failed", lead.id, res.reason);
        const { error: revertErr } = await admin
          .from("leads")
          .update({ drip_step: currentStep })
          .eq("id", lead.id)
          .eq("drip_step", nextStep.step);
        if (revertErr) console.error("simulado-drip revert failed", lead.id, revertErr);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, sent, failed, skippedBuyer, skippedClaimed, scanned: leads.length });
  } catch (err) {
    await alertCronFailure("simulado-drip", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
