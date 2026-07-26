import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import {
  offerCheckoutUrl,
  simuladoAccessUrl,
  turmaPickUrl,
  unsubscribeUrl,
  WELCOME_COUPONS,
  UNDECIDED_COHORT,
  REVALIDA_2027_1_SLUG,
} from "@/lib/magnet/links";
import { alertCronFailure } from "@/lib/admin/cron-alert";
// Shared with the exam + report so the reminder copy can never drift from the
// rules actually enforced on the site.
import { SIMULADO_MIN_ANSWERS, SIMULADO_TOTAL } from "@/lib/magnet/simulado";
import {
  planSimuladoSend,
  progressLineFor,
  urgencyLineFor,
  LAST_LADDER_STEP,
} from "@/lib/magnet/simulado-drip";
import {
  cohortInfoFor,
  loadCohortDirectory,
  pickRolloverCohort,
  type CohortDirectory,
} from "@/lib/magnet/cohort-rollover";
import { EXAM_PHASE_LABELS, getExamPhase } from "@/lib/cohort-timing";

// Follow-up sequence for the 100-question simulado funnel.
//
// Membership is `leads.sim_entered_at IS NOT NULL` — NOT source='simulado-100'.
// See the scan query below for why.
//
// The D0 delivery (resume link, lead-sim-access) is sent inline when the exam
// starts. This cron owns everything after it: finish nudges, the pivot into the
// sales spine, the turma question for undecided leads, and the post-exam rollover.
//
// The DECISION is entirely in lib/magnet/simulado-drip (pure, tested by
// scripts/test-simulado-drip.mjs); this file is the I/O around it — read the
// lead, build the vars, claim the rung, send, record. Shape of the sequence and
// the reasoning behind it: docs/simulado-drip-design.md.
//
// Three invariants worth restating because they are load-bearing:
//
//  • RESERVE-FIRST CLAIM on drip_step, reverted on send failure, so overlapping
//    runs can never double-send. A rung that resolves to "hold" is NOT claimed,
//    so a suppressed lead resumes exactly where they left off.
//  • NO PARTIAL DIAGNOSIS. `simScore` is populated only for a submitted attempt;
//    a non-finisher's only performance fact is progressLine. Karina's rule.
//  • The welcome coupon may now appear more than once (finish-2 and the later
//    sales rungs both carry it). That is deliberate: the old "exactly once"
//    constraint existed to stop a lead falling between two forked tracks and
//    getting zero coupons. With one spine everybody reaches it.
//
// Schedule: app/vercel.json. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Sao_Paulo";

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
}

// One-click turma buttons for the undecided track. HTML, because interpolate()
// does not escape — the values are our own cohort rows, never user input.
function turmaOptionsHtml(dir: CohortDirectory, token: string): string {
  const options = [...dir.values()]
    .filter((c) => c.active && c.testDate != null)
    .sort((a, b) => (a.testDate! < b.testDate! ? -1 : 1));

  return options
    .map((c) => {
      const when = c.dateConfirmed
        ? ` — prova em ${c.testDate!.slice(8, 10)}/${c.testDate!.slice(5, 7)}/${c.testDate!.slice(0, 4)}`
        : " — data ainda não confirmada";
      return `<p style="margin:0 0 10px;"><a href="${turmaPickUrl(token, c.slug)}" style="display:inline-block;padding:11px 18px;background:#f3e8ff;color:#7a1d91;font-weight:700;text-decoration:none;border-radius:8px;">${c.name}</a><span style="color:#6b7280;font-size:13px;">${when}</span></p>`;
    })
    .join("\n");
}

// A {kind}--{phase} row, when an editor has written one, wins over the base
// template. Nothing seeds these — they exist so phase-specific copy can be added
// in /admin/email-templates without a deploy. Selection is (funnel step × phase),
// as designed; the base template covers every phase until a variant appears.
function resolveKind(base: string, phase: string, available: Set<string>): string {
  const variant = `${base}--${phase}`;
  return available.has(variant) ? variant : base;
}

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
    const now = new Date();
    const today = now.toLocaleDateString("en-CA", { timeZone: TZ });

    // Active simulado-funnel leads, oldest first, with rungs left.
    //
    // MEMBERSHIP IS `sim_entered_at`, NOT `source`. `leads.source` is first-touch
    // and is never overwritten, so an address captured by another funnel months
    // ago keeps that source even after doing the whole 100-question exam. Selecting
    // on source meant those leads — including one who answered 99 and submitted —
    // were invisible to this cron and got zero follow-up. lead-drip and
    // lead-recovery exclude on the same column, which is what keeps drip_step
    // exclusively owned here.
    //
    // The verified-or-started filter is the deliverability guardrail applied in
    // SQL rather than in the loop: an address that has never clicked anything and
    // never did anything on site is not a lead yet, and would otherwise sit in
    // the scan window forever crowding out real ones.
    const { data: leads } = await admin
      .from("leads")
      .select(
        "id, email, drip_step, sim_entered_at, target_cohort, previous_target_cohort, first_name, result_token, unsubscribe_token, verified_at, sim_started_at, sim_completed_at, sim_progress, sim_answered, sim_score, sim_reminder_step, sim_sales_step",
      )
      .eq("drip_status", "active")
      .not("sim_entered_at", "is", null)
      .lt("drip_step", LAST_LADDER_STEP)
      .or("verified_at.not.is.null,sim_started_at.not.is.null")
      .order("sim_entered_at", { ascending: true })
      .limit(300);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "no active simulado leads due" });
    }

    const cohorts = await loadCohortDirectory();
    const rolloverTarget = pickRolloverCohort(cohorts, today);

    // Which lead-sim-* templates actually exist and are active — needed before we
    // can pick a {kind}--{phase} variant, since getEmailTemplate falls back to the
    // code default and there is no default for a variant that was never written.
    const { data: templateRows } = await admin
      .from("email_templates")
      .select("kind")
      .like("kind", "lead-sim-%")
      .eq("active", true);
    const availableKinds = new Set((templateRows ?? []).map((r) => r.kind as string));

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
    let rolled = 0;
    let skippedBuyer = 0;
    let skippedClaimed = 0;
    let failed = 0;
    const held: Record<string, number> = {};
    const byStage: Record<string, number> = {};

    for (const lead of leads) {
      const email = (lead.email as string).toLowerCase();
      if (excluded.has(email)) {
        skippedBuyer++;
        continue;
      }

      const slug = (lead.target_cohort as string | null) ?? REVALIDA_2027_1_SLUG;
      const cohort = cohortInfoFor(cohorts, slug);
      const timing = getExamPhase(cohort.testDate, { dateConfirmed: cohort.dateConfirmed }, now);

      // ── Post-exam rollover ──────────────────────────────────────────────────
      // Their exam has happened. Stop preparing them for it: move them to the
      // next turma, keep a record of what they originally picked so /admin/leads
      // never misreports their choice, and tell them — with a way to correct it.
      // The move itself makes the condition false, so this can never repeat.
      if (timing.isPast && slug !== UNDECIDED_COHORT && rolloverTarget && rolloverTarget.slug !== slug) {
        const { error: rollErr } = await admin
          .from("leads")
          .update({
            target_cohort: rolloverTarget.slug,
            previous_target_cohort: (lead.previous_target_cohort as string | null) ?? slug,
            last_emailed_at: new Date().toISOString(),
          })
          .eq("id", lead.id)
          .eq("target_cohort", slug);
        if (rollErr) {
          console.error("simulado-drip rollover failed", lead.id, rollErr);
          failed++;
          continue;
        }

        const rolledTiming = getExamPhase(
          rolloverTarget.testDate,
          { dateConfirmed: rolloverTarget.dateConfirmed },
          now,
        );
        try {
          await sendTemplateEmail({
            kind: "lead-sim-rollover",
            to: email,
            vars: {
              greeting: greetingFor(lead.first_name as string | null),
              previousCohortName: cohort.name || slug,
              cohortName: rolloverTarget.name,
              examDate: rolledTiming.dateConfirmed ? (rolledTiming.examDateLabel ?? "") : "",
              urgencyLine: urgencyLineFor({ ...rolledTiming, cohortName: rolloverTarget.name }),
              turmaUrl: turmaPickUrl(lead.result_token as string, ""),
              accessUrl: simuladoAccessUrl((lead.result_token as string) ?? ""),
              unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
            },
            fromName: FUNNEL_SENDER_NAME,
          });
          sent++;
        } catch (e) {
          console.error("lead-sim-rollover send threw", lead.id, e);
          failed++;
        }
        rolled++;
        // One email per lead per run — the ladder waits for the next run.
        continue;
      }

      const answered =
        (lead.sim_answered as number | null) ??
        (lead.sim_progress ? Object.keys(lead.sim_progress as Record<string, unknown>).length : 0);
      const submitted = lead.sim_completed_at != null;

      // Clocked from sim_entered_at, not completed_at: completed_at belongs to
      // whichever funnel first captured the address and may be months older.
      const elapsedDays = Math.floor(
        (now.getTime() - new Date(lead.sim_entered_at as string).getTime()) / 86_400_000,
      );

      const plan = planSimuladoSend({
        dripStep: lead.drip_step as number,
        elapsedDays,
        answered,
        submitted,
        verified: lead.verified_at != null,
        started: lead.sim_started_at != null,
        undecided: slug === UNDECIDED_COHORT,
        cohortForSale: cohort.isForSale,
        phase: timing.phase,
        reminderStep: (lead.sim_reminder_step as number | null) ?? 0,
        salesStep: (lead.sim_sales_step as number | null) ?? 0,
      });

      if (plan.action === "hold") {
        held[plan.reason] = (held[plan.reason] ?? 0) + 1;
        continue;
      }

      const welcome = WELCOME_COUPONS[slug] ?? WELCOME_COUPONS[REVALIDA_2027_1_SLUG];
      const kind = resolveKind(plan.kind, timing.phase, availableKinds);

      const vars: Record<string, string> = {
        greeting: greetingFor(lead.first_name as string | null),
        coupon: welcome.code,
        couponPercent: `${welcome.percent}%`,
        // The ONLY performance fact a non-finisher may ever receive.
        progressLine: progressLineFor(answered, {
          total: SIMULADO_TOTAL,
          minAnswers: SIMULADO_MIN_ANSWERS,
        }),
        questionsLeft: String(Math.max(1, SIMULADO_TOTAL - answered)),
        // Populated ONLY for a submitted attempt. A non-finisher template must
        // never reference it, and an empty string is what it would render if one
        // ever did — never a misleading zero.
        simScore: submitted ? String((lead.sim_score as number | null) ?? 0) : "",
        // Cohort intelligence. examDate/daysUntilTest are blank for an
        // unconfirmed or absent date, so copy that quotes them degrades to
        // nothing rather than to a date the board has not announced.
        cohortName: cohort.name || "",
        examDate: timing.dateConfirmed ? (timing.examDateLabel ?? "") : "",
        daysUntilTest:
          timing.dateConfirmed && timing.daysUntilTest != null ? String(timing.daysUntilTest) : "",
        phase: timing.phase,
        phaseLabel: EXAM_PHASE_LABELS[timing.phase],
        urgencyLine: urgencyLineFor({ ...timing, cohortName: cohort.name || null }),
        turmaOptions: turmaOptionsHtml(cohorts, (lead.result_token as string) ?? ""),
        checkoutUrl: offerCheckoutUrl({
          email,
          coupon: welcome.code,
          cohort: slug,
          utmCampaign: kind,
        }),
        accessUrl: simuladoAccessUrl((lead.result_token as string) ?? ""),
        unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
      };

      // Reserve-first conditional claim: advance drip_step only if it still
      // matches what we read, so overlapping runs can't double-send.
      const currentStep = lead.drip_step as number;
      const { data: claimed, error: claimErr } = await admin
        .from("leads")
        .update({ drip_step: plan.step, last_emailed_at: new Date().toISOString() })
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
        byStage[plan.stage] = (byStage[plan.stage] ?? 0) + 1;
        // Stage counters advance only on a successful send, so a failure that
        // reverts the rung cannot burn a nudge or a sales step with it.
        const counters: Record<string, number> = {};
        if (plan.reminderStep != null) counters.sim_reminder_step = plan.reminderStep;
        if (plan.salesStep != null) counters.sim_sales_step = plan.salesStep;
        if (Object.keys(counters).length > 0) {
          const { error: counterErr } = await admin.from("leads").update(counters).eq("id", lead.id);
          if (counterErr) console.error("simulado-drip counter update failed", lead.id, counterErr);
        }
      } else {
        console.error("simulado-drip send failed", lead.id, res.reason);
        const { error: revertErr } = await admin
          .from("leads")
          .update({ drip_step: currentStep })
          .eq("id", lead.id)
          .eq("drip_step", plan.step);
        if (revertErr) console.error("simulado-drip revert failed", lead.id, revertErr);
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      rolled,
      failed,
      skippedBuyer,
      skippedClaimed,
      byStage,
      held,
      scanned: leads.length,
    });
  } catch (err) {
    await alertCronFailure("simulado-drip", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
