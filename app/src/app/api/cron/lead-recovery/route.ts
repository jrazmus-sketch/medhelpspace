import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import {
  recoverUrl,
  resumeUrl,
  unsubscribeUrl,
  offerCheckoutUrl,
  RECOVERY_COUPONS,
  REVALIDA_2026_2_SLUG,
  FLASHCARDS_SOURCE,
} from "@/lib/magnet/links";
import { alertCronFailure } from "@/lib/admin/cron-alert";

// Pre-verify lead recovery — the counterpart to lead-drip, which only ever touches
// VERIFIED leads. This job re-engages the two UNVERIFIED segments (schema-patch-
// lead-recovery.sql), advancing each lead by AT MOST one email per run:
//
//   Segment A — finished all 15, never verified. ONE magic-link email that verifies
//     on click (→ recuperar route) and reveals the plan. Gated by recovery_a_sent_at.
//   Segment B — abandoned mid-quiz. TWO nudges to come back and finish (resume link):
//     step 0→1 at +1 day, step 1→2 at +3 days. Gated by recovery_b_step.
//
// Guardrails to protect a young sending domain: unverified soft-captures were
// suppressed by design, so we re-enable sending narrowly — recent captures only
// (≤30d), a per-segment cap, buyers excluded, and drip_status='active' (so bounced/
// unsubscribed/complained leads — now fed by the Resend webhook — are skipped).
// Schedule: app/vercel.json. Auth: Bearer CRON_SECRET.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 86_400_000;
const SEG_A_MIN_HOURS = 3; // let a finisher breathe before the "1 click" nudge
const SEG_B_NUDGE1_DAYS = 1; // "yesterday you started…"
const SEG_B_NUDGE2_DAYS = 3; // gap AFTER nudge 1 before the last touch
const MAX_AGE_DAYS = 30; // never email a stale capture
const CAP_PER_SEGMENT = 100; // young-domain volume guard

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
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
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const maxAgeIso = new Date(now - MAX_AGE_DAYS * DAY_MS).toISOString();

    // Buyer exclusion (Guarantee A): never email anyone who already bought, matched by
    // email — even if a converted-flip was missed. Mirrors lead-drip's read-side backstop.
    const { data: memberUsers } = await admin
      .from("user_cohort_memberships")
      .select("user_id");
    const memberIds = [...new Set((memberUsers ?? []).map((r) => r.user_id as string))];
    let buyers = new Set<string>();
    if (memberIds.length) {
      const { data: memberEmails } = await admin
        .from("profiles")
        .select("email")
        .in("id", memberIds);
      buyers = new Set(
        (memberEmails ?? [])
          .map((r) => (r.email as string | null)?.toLowerCase())
          .filter((e): e is string => Boolean(e)),
      );
    }

    // Specialty id → name for {{weakSpecialties}} (Segment A).
    const { data: specs } = await admin.from("specialties").select("id, name");
    const specName = new Map((specs ?? []).map((s) => [s.id as number, s.name as string]));

    let sentA = 0;
    let sentB = 0;
    let failed = 0;
    let skippedBuyer = 0;
    let skippedClaimed = 0;

    // ── Segment A — finished, never verified ────────────────────────────────────
    const { data: segA } = await admin
      .from("leads")
      .select(
        "id, email, first_name, score, weak_specialty_ids, result_token, unsubscribe_token, completed_at",
      )
      .eq("drip_status", "active")
      .neq("source", FLASHCARDS_SOURCE) // flashcards funnel has its own sequence
      .is("verified_at", null)
      .not("completed_at", "is", null)
      .is("recovery_a_sent_at", null)
      .gte("created_at", maxAgeIso)
      .order("completed_at", { ascending: true })
      .limit(CAP_PER_SEGMENT);

    for (const lead of segA ?? []) {
      const email = (lead.email as string).toLowerCase();
      if (buyers.has(email)) {
        skippedBuyer++;
        continue;
      }
      // Let the finish settle before nudging.
      const completedMs = new Date(lead.completed_at as string).getTime();
      if (now - completedMs < SEG_A_MIN_HOURS * 3_600_000) continue;

      const weakNames = ((lead.weak_specialty_ids as number[] | null) ?? [])
        .map((id) => specName.get(id))
        .filter(Boolean)
        .join(", ");

      // Reserve-first: claim the send ONLY if still unsent, so overlapping runs can't
      // double-send. Revert on send failure so the next run retries.
      const { data: claimed } = await admin
        .from("leads")
        .update({ recovery_a_sent_at: nowIso, recovery_sent_at: nowIso })
        .eq("id", lead.id)
        .is("recovery_a_sent_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) {
        skippedClaimed++;
        continue;
      }

      const res = await sendTemplateEmail({
        kind: "lead-recover-finished",
        to: email,
        vars: {
          greeting: greetingFor(lead.first_name as string | null),
          score: lead.score != null ? String(lead.score) : "—",
          weakSpecialties: weakNames || "suas matérias mais difíceis",
          recoverUrl: recoverUrl((lead.result_token as string) ?? ""),
          unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
        },
        fromName: FUNNEL_SENDER_NAME,
      }).catch((e) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));

      if (res.ok) {
        sentA++;
      } else {
        console.error("lead-recovery A send failed", lead.id, res.reason);
        await admin
          .from("leads")
          .update({ recovery_a_sent_at: null })
          .eq("id", lead.id);
        failed++;
      }
    }

    // ── Segment B — abandoned mid-quiz (two nudges) ─────────────────────────────
    const { data: segB } = await admin
      .from("leads")
      .select(
        "id, email, first_name, result_token, unsubscribe_token, target_cohort, created_at, recovery_b_step, recovery_sent_at",
      )
      .eq("drip_status", "active")
      .neq("source", FLASHCARDS_SOURCE) // flashcards funnel has its own sequence
      .is("verified_at", null)
      .is("completed_at", null)
      .lt("recovery_b_step", 2)
      .gte("created_at", maxAgeIso)
      .order("created_at", { ascending: true })
      .limit(CAP_PER_SEGMENT);

    for (const lead of segB ?? []) {
      const email = (lead.email as string).toLowerCase();
      if (buyers.has(email)) {
        skippedBuyer++;
        continue;
      }

      const currentStep = (lead.recovery_b_step as number) ?? 0;
      const createdMs = new Date(lead.created_at as string).getTime();

      // Due-ness per step: nudge 1 after +1d from capture; nudge 2 after +3d from nudge 1.
      let kind: string | null = null;
      if (currentStep === 0) {
        if (now - createdMs >= SEG_B_NUDGE1_DAYS * DAY_MS) kind = "lead-recover-unfinished-1";
      } else if (currentStep === 1) {
        const lastMs = lead.recovery_sent_at
          ? new Date(lead.recovery_sent_at as string).getTime()
          : createdMs;
        if (now - lastMs >= SEG_B_NUDGE2_DAYS * DAY_MS) kind = "lead-recover-unfinished-2";
      }
      if (!kind) continue; // not due yet

      const nextStep = currentStep + 1;
      const { data: claimed } = await admin
        .from("leads")
        .update({ recovery_b_step: nextStep, recovery_sent_at: nowIso })
        .eq("id", lead.id)
        .eq("recovery_b_step", currentStep)
        .select("id");
      if (!claimed || claimed.length === 0) {
        skippedClaimed++;
        continue;
      }

      // Segment-B leads never completed the cohort picker, so target_cohort is the DB
      // default (revalida-2026-2) → the turma-scoped recovery coupon (VOLTA5, 5%). The
      // fallback keeps an unknown/future cohort on the 2026-2 code rather than crashing.
      const cohort = (lead.target_cohort as string | null) ?? REVALIDA_2026_2_SLUG;
      const recovery = RECOVERY_COUPONS[cohort] ?? RECOVERY_COUPONS[REVALIDA_2026_2_SLUG];
      const vars: Record<string, string> = {
        greeting: greetingFor(lead.first_name as string | null),
        resumeUrl: resumeUrl((lead.result_token as string) ?? ""),
        coupon: recovery.code,
        couponPercent: `${recovery.percent}%`,
        unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
      };
      // Nudge 2 also offers a direct path to checkout with the recovery coupon.
      if (kind === "lead-recover-unfinished-2") {
        vars.checkoutUrl = offerCheckoutUrl({
          email,
          coupon: recovery.code,
          cohort,
          utmCampaign: "lead-recover-unfinished-2",
        });
      }

      const res = await sendTemplateEmail({ kind, to: email, vars, fromName: FUNNEL_SENDER_NAME }).catch(
        (e) => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }),
      );

      if (res.ok) {
        sentB++;
      } else {
        console.error("lead-recovery B send failed", lead.id, res.reason);
        await admin
          .from("leads")
          .update({ recovery_b_step: currentStep })
          .eq("id", lead.id)
          .eq("recovery_b_step", nextStep);
        failed++;
      }
    }

    return NextResponse.json({
      ok: true,
      sentA,
      sentB,
      failed,
      skippedBuyer,
      skippedClaimed,
      scannedA: segA?.length ?? 0,
      scannedB: segB?.length ?? 0,
    });
  } catch (err) {
    await alertCronFailure("lead-recovery", err);
    return NextResponse.json({ error: "cron_failed" }, { status: 500 });
  }
}
