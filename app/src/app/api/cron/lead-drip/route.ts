import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import {
  offerCheckoutUrl,
  resultUrl,
  unsubscribeUrl,
  WELCOME_COUPONS,
  FLASHCARDS_SOURCE,
} from "@/lib/magnet/links";
import { alertCronFailure } from "@/lib/admin/cron-alert";

// Lead-magnet email drip (FREE-FUNNEL-V2-SCOPE.md Group 6). Advances each lead by
// AT MOST one step per run; the per-step offsetDays gate enforces the real schedule
// (D1/D2/D4/D7/final) even though we step sequentially.
// Schedule: app/vercel.json (daily). Auth: Bearer CRON_SECRET (Vercel sends it).
//
// Segmentation (item 11): the drip targets ONLY VERIFIED leads. In this funnel a
// lead can only verify AT the results step (after finishing all 15), so verified ⟹
// finished ⟹ "hot" — they get the full sequence. Unverified soft-captures are
// SUPPRESSED entirely (we never confirmed their inbox → high bounce/complaint risk
// for a young sending domain). The clock starts at verified_at, not created_at.

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The discount lives ONLY on the D2 step (the turma's WELCOME coupon — REVALIDA5 /
// REVALIDA10, see WELCOME_COUPONS). D1/D4/D7 are pure nurture (no coupon → checkout
// lands on the live storefront price). The old large-discount cycle (RETA2026 on
// every step + ULTIMA2026 final) was removed 2026-07-02: step 5 (lead-final) is now
// skipped for ALL turmas — the entry is kept so re-enabling a final push is a
// one-liner, and the `.lt(drip_step, 5)` boundary below still terminates the drip.
const STEPS = [
  { step: 1, kind: "lead-d1", offsetDays: 1 },
  { step: 2, kind: "lead-d2", offsetDays: 2 },
  { step: 3, kind: "lead-d4", offsetDays: 4 },
  { step: 4, kind: "lead-d7", offsetDays: 7 },
  { step: 5, kind: "lead-final", offsetDays: 11 },
] as const;

export async function GET(request: NextRequest) {
  // Vercel Cron auth — constant-time Bearer compare (mirrors lifecycle cron).
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

  // Active + VERIFIED leads only; oldest-verified first. drip_step < last step (5)
  // means more to send. Unverified soft-captures are intentionally excluded.
  const { data: leads } = await admin
    .from("leads")
    .select(
      "id, email, score, weak_specialty_ids, drip_step, verified_at, target_cohort, first_name, result_token",
    )
    .eq("drip_status", "active")
    .neq("source", FLASHCARDS_SOURCE) // the flashcards funnel runs its own drip
    .not("verified_at", "is", null)
    .lt("drip_step", STEPS[STEPS.length - 1].step)
    .order("verified_at", { ascending: true })
    .limit(300);

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "no active verified leads due" });
  }

  // Read-side backstop for §6.5 Guarantee A: never email anyone who already bought
  // (matched by email), even if the finalize.ts converted-flip was missed/raced.
  const { data: memberUsers } = await admin
    .from("user_cohort_memberships")
    .select("user_id");
  const memberIds = [...new Set((memberUsers ?? []).map((r) => r.user_id as string))];
  let excluded = new Set<string>();
  if (memberIds.length) {
    const { data: memberEmails } = await admin
      .from("profiles")
      .select("email")
      .in("id", memberIds);
    excluded = new Set(
      (memberEmails ?? [])
        .map((r) => (r.email as string | null)?.toLowerCase())
        .filter((e): e is string => Boolean(e)),
    );
  }

  // Specialty id → name, for personalizing {{weakSpecialties}}.
  const { data: specs } = await admin.from("specialties").select("id, name");
  const specName = new Map((specs ?? []).map((s) => [s.id as number, s.name as string]));

  const examLabelByCohort: Record<string, string> = {
    "revalida-2026-2": "13 de setembro",
    "revalida-2027-1": "início de 2027",
    "revalida-20272": "setembro de 2027",
  };

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

    const targetCohort = (lead.target_cohort as string | null) ?? "revalida-2026-2";

    const currentStep = lead.drip_step as number;
    const nextStep = STEPS.find((s) => s.step === currentStep + 1);
    if (!nextStep) continue;

    // The final deep-discount email (lead-final / ULTIMA2026) is retired — no turma
    // gets it. Mark the lead done so it drops out of future scans.
    if (nextStep.step === 5) {
      await admin.from("leads").update({ drip_step: 5 }).eq("id", lead.id);
      continue;
    }

    // Clock starts when the lead VERIFIED (entered the funnel proper), not at
    // soft-capture — a lead who verifies days later still gets a clean D1…final run.
    const elapsedDays = Math.floor(
      (now - new Date(lead.verified_at as string).getTime()) / 86_400_000,
    );
    if (elapsedDays < nextStep.offsetDays) continue; // not due yet

    const weakNames = ((lead.weak_specialty_ids as number[] | null) ?? [])
      .map((id) => specName.get(id))
      .filter(Boolean)
      .join(", ");

    // Welcome discount on D2 only; the code is the turma's own (REVALIDA5 / REVALIDA10).
    const coupon = nextStep.step === 2 ? (WELCOME_COUPONS[targetCohort]?.code ?? null) : null;

    const vars: Record<string, string> = {
      greeting: greetingFor(lead.first_name as string | null),
      score: lead.score != null ? String(lead.score) : "—",
      weakSpecialties: weakNames || "suas matérias mais difíceis",
      examLabel: examLabelByCohort[targetCohort] ?? "a sua prova",
      resultUrl: resultUrl((lead.result_token as string) ?? ""),
      checkoutUrl: offerCheckoutUrl({
        email,
        coupon,
        cohort: targetCohort,
        utmCampaign: nextStep.kind,
      }),
      unsubscribeUrl: unsubscribeUrl(""), // token filled below
    };

    // Need the token for a working unsubscribe link — fetch lazily per lead.
    const { data: tokRow } = await admin
      .from("leads")
      .select("unsubscribe_token")
      .eq("id", lead.id)
      .single();
    vars.unsubscribeUrl = unsubscribeUrl((tokRow?.unsubscribe_token as string) ?? "");

    // Reserve-first conditional claim: atomically advance drip_step ONLY if it still
    // matches what we read (`currentStep`). If another overlapping run already claimed
    // this step, zero rows come back and we skip — this prevents double-sends. We only
    // find out whether the send itself succeeded AFTER this claim, so on failure below
    // we revert it so the next run retries.
    const { data: claimed, error: claimErr } = await admin
      .from("leads")
      .update({ drip_step: nextStep.step, last_emailed_at: new Date().toISOString() })
      .eq("id", lead.id)
      .eq("drip_step", currentStep)
      .select("id");
    if (claimErr) {
      console.error("lead-drip claim failed", lead.id, claimErr);
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
        kind: nextStep.kind,
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
      console.error("lead-drip send failed", lead.id, res.reason);
      // Revert the claim so the next run retries this same step.
      const { error: revertErr } = await admin
        .from("leads")
        .update({ drip_step: currentStep })
        .eq("id", lead.id)
        .eq("drip_step", nextStep.step);
      if (revertErr) {
        console.error("lead-drip revert failed", lead.id, revertErr);
      }
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    skippedBuyer,
    skippedClaimed,
    scanned: leads.length,
  });
  } catch (err) {
    await alertCronFailure("lead-drip", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
