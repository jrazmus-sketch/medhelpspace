"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import {
  getMagnetQuestions,
  MAGNET_GATED_IDS,
  type MagnetQuestion,
} from "@/lib/magnet/questions";
import { buildPlanPreview, type MagnetAnswer, type PlanPreview } from "@/lib/magnet/plan-preview";
import { magnetUrl, unsubscribeUrl, offerCheckoutUrl } from "@/lib/magnet/links";

// Free-magnet capture/unlock + result finalization (FREE-FUNNEL-BUILD-SPEC.md §3.3).
// All writes go through the service-role admin client — leads has deny-all RLS and
// the browser Supabase client hangs in this app, so capture must be a server action.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Utm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

// Called after the 5th free question. Captures the email, fires the D0 delivery
// email (awaited — serverless kills fire-and-forget), and returns the 10 gated
// questions to reveal. Idempotent on lower(email): a re-submit refreshes UTM
// without resetting drip progress.
export async function captureLeadAndUnlock(input: {
  email: string;
  utm?: Utm;
}): Promise<{ ok: boolean; reason?: string; gatedQuestions: MagnetQuestion[] }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid_email", gatedQuestions: [] };
  }

  const admin = createAdminClient();
  const utm = input.utm ?? {};

  // Manual upsert on lower(email): the unique index is on an expression, so we
  // select-then-insert/update rather than rely on PostgREST onConflict.
  const { data: existing } = await admin
    .from("leads")
    .select("id, unsubscribe_token")
    .eq("email", email)
    .maybeSingle();

  let token: string;
  if (existing) {
    // Refresh attribution only if newly provided; never reset drip progress.
    await admin
      .from("leads")
      .update({
        utm_source: utm.source ?? undefined,
        utm_medium: utm.medium ?? undefined,
        utm_campaign: utm.campaign ?? undefined,
        utm_term: utm.term ?? undefined,
        utm_content: utm.content ?? undefined,
      })
      .eq("id", existing.id);
    token = existing.unsubscribe_token as string;
  } else {
    const { data: inserted } = await admin
      .from("leads")
      .insert({
        email,
        utm_source: utm.source ?? null,
        utm_medium: utm.medium ?? null,
        utm_campaign: utm.campaign ?? null,
        utm_term: utm.term ?? null,
        utm_content: utm.content ?? null,
      })
      .select("unsubscribe_token")
      .single();
    token = (inserted?.unsubscribe_token as string) ?? "";
  }

  // D0 delivery email — awaited; a Resend failure must NOT block the unlock.
  try {
    await sendTemplateEmail({
      kind: "lead-d0",
      to: email,
      vars: {
        magnetUrl: magnetUrl(),
        deckUrl: magnetUrl(),
        checkoutUrl: offerCheckoutUrl({ email, coupon: "RETA2026", utmCampaign: "lead-d0" }),
        unsubscribeUrl: token ? unsubscribeUrl(token) : magnetUrl(),
      },
    });
  } catch {
    // swallow — capture succeeds regardless of email deliverability
  }

  const gatedQuestions = await getMagnetQuestions(MAGNET_GATED_IDS);
  return { ok: true, gatedQuestions };
}

const VALID_COHORTS = new Set(["revalida-2026-2", "revalida-2027-1"]);

// Called after the 15th question, once the lead picks which exam they're studying
// for. Persists the score/result + target_cohort, and returns the study-plan
// preview built for THAT cohort's exam date. target_cohort segments the drip so a
// 2027.1 lead never receives a 2026.2 discount email.
export async function finalizeLeadResult(input: {
  email: string;
  answers: MagnetAnswer[];
  targetCohort?: string;
}): Promise<{ ok: boolean; planPreview: PlanPreview | null }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, planPreview: null };

  const targetCohort = VALID_COHORTS.has(input.targetCohort ?? "")
    ? (input.targetCohort as string)
    : "revalida-2026-2";

  const answers = input.answers ?? [];
  const score = answers.filter((a) => a.isCorrect).length;
  const weakSpecialtyIds = [
    ...new Set(
      answers
        .filter((a) => !a.isCorrect && a.specialtyId != null)
        .map((a) => a.specialtyId as number),
    ),
  ];

  const admin = createAdminClient();
  await admin
    .from("leads")
    .update({
      score,
      weak_specialty_ids: weakSpecialtyIds,
      target_cohort: targetCohort,
      result: answers.map((a) => ({
        question_id: a.questionId,
        specialty_id: a.specialtyId,
        is_correct: a.isCorrect,
      })),
    })
    .eq("email", email);

  const planPreview = await buildPlanPreview(answers, targetCohort);
  return { ok: true, planPreview };
}
