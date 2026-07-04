"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import { getClientIp } from "@/lib/pagbank/rate-limit";
import {
  getMagnetQuestions,
  MAGNET_GATED_IDS,
  type MagnetQuestion,
} from "@/lib/magnet/questions";
import {
  buildPlanPreview,
  type MagnetAnswer,
  type PlanPreview,
  type FreeResultSummary,
} from "@/lib/magnet/plan-preview";
import { getSampleFlashcardsForSpecialties, type MagnetFlashcard } from "@/lib/magnet/flashcards";
import { resultUrl, unsubscribeUrl } from "@/lib/magnet/links";
import {
  guardCodeRequest,
  honeypotTripped,
  isDisposableEmail,
} from "@/lib/magnet/anti-abuse";

// Free-funnel v2 (trust-first): HYBRID capture. FREE-FUNNEL-V2-SCOPE.md.
//   • Q5  → captureLeadAndUnlock: SOFT capture (unverified), NO email sent.
//   • Q15 → finalizeLeadResult:   store score/result, return the FREE summary
//           (raw score + missed topics + days) — the plan/flashcards stay gated.
//   • Results → requestClaimCode:  anti-abuse ladder, then email a 6-digit code.
//             → verifyClaimCode:   confirm the code → reveal plan + flashcards,
//               fire the delivery email, return the durable result token.
//
// All writes go through the service-role admin client (leads has deny-all RLS and
// the browser Supabase client hangs in this app). The D0 delivery email now fires
// ONLY after verification — we never email an unverified soft-captured address,
// killing the spam-cannon / domain-reputation risk (Group 1).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_TTL_MS = 10 * 60 * 1000; // 10-minute code expiry
const CODE_RESEND_MIN_MS = 30 * 1000; // min gap between resends to one address
const CODE_MAX_ATTEMPTS = 6; // wrong-guess cap before the code burns

type Utm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  gclid?: string; // Google Ads click id — attribution + offline conversion import
};

// ── Small helpers (module-local; "use server" files export only async fns) ──────

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function genCode(): string {
  // 6 digits, cryptographically random, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
}

// "joao@gmail.com" → "j***@gmail.com" (shown at the code step so the lead can
// confirm we have the right inbox without exposing the full address).
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const stars = "*".repeat(Math.max(3, local.length - 1));
  return `${local.slice(0, 1)}${stars}@${domain}`;
}

function cleanFirstName(name?: string | null): string | null {
  const n = (name ?? "").trim().slice(0, 60);
  return n.length > 0 ? n : null;
}

// Rebuild MagnetAnswer[] from the stored `result` JSON so the plan + flashcards
// are recomputed SERVER-SIDE at verify time (and on the durable page), never
// trusting the client's re-post.
type StoredResultRow = {
  question_id?: number;
  specialty_id?: number | null;
  page_id?: number | null;
  is_correct?: boolean;
};
function answersFromStoredResult(result: unknown): MagnetAnswer[] {
  if (!Array.isArray(result)) return [];
  return (result as StoredResultRow[]).map((r) => ({
    questionId: Number(r.question_id ?? 0),
    specialtyId: r.specialty_id ?? null,
    pageId: Number(r.page_id ?? 0),
    isCorrect: Boolean(r.is_correct),
  }));
}

// The scoring/diagnostic columns derived from a (partial or full) answer set.
// Deliberately NO completed_at / target_cohort — those belong only to the Q15
// finalize. Used by the Q5 partial capture, the per-answer incremental save, and
// finalize, so all three write these columns identically.
function buildProgressPayload(answers: MagnetAnswer[]) {
  return {
    score: answers.filter((a) => a.isCorrect).length,
    weak_specialty_ids: [
      ...new Set(
        answers
          .filter((a) => !a.isCorrect && a.specialtyId != null)
          .map((a) => a.specialtyId as number),
      ),
    ],
    questions_answered: answers.length,
    result: answers.map((a) => ({
      question_id: a.questionId,
      specialty_id: a.specialtyId,
      page_id: a.pageId,
      is_correct: a.isCorrect,
    })),
  };
}

async function clientIp(): Promise<string> {
  try {
    return getClientIp(await headers());
  } catch {
    return "unknown";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SOFT CAPTURE (after Q5) — store the lead unverified, unlock the 10 gated
//    questions. NO email. Cheap checks only (format + honeypot + disposable).
// ═══════════════════════════════════════════════════════════════════════════════

export async function captureLeadAndUnlock(input: {
  email: string;
  utm?: Utm;
  honeypot?: string | null;
  // The Q1–Q5 answers (held in browser state until now). Persisted here as PARTIAL
  // progress so a lead who bails before Q15 still shows real progress in /admin/leads.
  answers?: MagnetAnswer[];
}): Promise<{ ok: boolean; reason?: string; gatedQuestions: MagnetQuestion[] }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid_email", gatedQuestions: [] };
  }
  if (honeypotTripped(input.honeypot)) {
    return { ok: false, reason: "honeypot", gatedQuestions: [] };
  }
  if (isDisposableEmail(email)) {
    return { ok: false, reason: "disposable_email", gatedQuestions: [] };
  }

  const admin = createAdminClient();
  const utm = input.utm ?? {};

  // Manual upsert on lower(email): the unique index is on an expression, so we
  // select-then-insert/update rather than rely on PostgREST onConflict. Never
  // reset drip progress on a re-submit.
  const { data: existing } = await admin
    .from("leads")
    .select("id, questions_answered")
    .eq("email", email)
    .maybeSingle();

  // Partial progress from the first 5 answers. Never sets completed_at — only the
  // Q15 finalize marks completion.
  const answers = input.answers ?? [];
  const progress = answers.length > 0 ? buildProgressPayload(answers) : null;

  if (existing) {
    // `?? undefined` omits the key from the PATCH so a later submit without a
    // value never wipes an already-captured attribution field. Progress is only
    // ADVANCED, never regressed: a re-submit of the gate must not overwrite the
    // deeper progress a finisher already stored.
    const grew =
      progress != null &&
      answers.length > ((existing.questions_answered as number | null) ?? 0);
    await admin
      .from("leads")
      .update({
        utm_source: utm.source ?? undefined,
        utm_medium: utm.medium ?? undefined,
        utm_campaign: utm.campaign ?? undefined,
        utm_term: utm.term ?? undefined,
        utm_content: utm.content ?? undefined,
        gclid: utm.gclid ?? undefined,
        ...(grew ? progress : {}),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("leads").insert({
      email,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      gclid: utm.gclid ?? null,
      ...(progress ?? {}),
    });
  }

  const gatedQuestions = await getMagnetQuestions(MAGNET_GATED_IDS);
  return { ok: true, gatedQuestions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1b. INCREMENTAL PROGRESS — fire-and-forget from the client after each gated
//     answer (Q6→Q15). Keeps `questions_answered`/`score`/`result` current so a
//     lead who abandons mid-quiz still shows accurate N/15 + diagnostics, instead
//     of the all-or-nothing 0/15-until-finish it was before. Best-effort: a failure
//     here must never affect the quiz UI (the client never awaits the result).
// ═══════════════════════════════════════════════════════════════════════════════

export async function saveLeadProgress(input: {
  email: string;
  answers: MagnetAnswer[];
}): Promise<{ ok: boolean }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false };
  const answers = input.answers ?? [];
  if (answers.length === 0) return { ok: false };

  const admin = createAdminClient();
  // Atomic monotonic guard: update only when this save ADVANCES progress
  // (questions_answered IS NULL, or strictly less than the incoming count). This
  // makes a late/out-of-order partial save a no-op and protects a row that finalize
  // has already completed — without a read-then-write race. completed_at is never
  // touched here. If the lead row doesn't exist yet, this simply matches nothing.
  const { error } = await admin
    .from("leads")
    .update(buildProgressPayload(answers))
    .eq("email", email)
    .or(`questions_answered.is.null,questions_answered.lt.${answers.length}`);
  if (error) {
    console.error("saveLeadProgress failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

const VALID_COHORTS = new Set(["revalida-2026-2", "revalida-2027-1"]);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FINALIZE (after Q15) — persist score/result + completion signal + cohort.
//    Returns ONLY the free summary; the plan + flashcards are the gated reward.
// ═══════════════════════════════════════════════════════════════════════════════

export async function finalizeLeadResult(input: {
  email: string;
  answers: MagnetAnswer[];
  targetCohort?: string;
}): Promise<{ ok: boolean; summary: FreeResultSummary | null }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, summary: null };

  const targetCohort = VALID_COHORTS.has(input.targetCohort ?? "")
    ? (input.targetCohort as string)
    : "revalida-2026-2";

  const answers = input.answers ?? [];
  const progress = buildProgressPayload(answers);
  const score = progress.score;

  const admin = createAdminClient();
  // Store page_id in the result JSON so verify + the durable page can rebuild the
  // plan server-side. UPSERT by email — the Q5 soft-capture row SHOULD exist, but
  // if it's missing (skipped/failed capture) an UPDATE would silently no-op and
  // leave `result` unwritten, so verify + the emailed durable link would render an
  // empty plan. Insert-if-missing guarantees the result is always persisted.
  //
  // finalize is authoritative: it writes the full answer set AND marks completion,
  // so it's the one progress write that may legitimately equal a prior partial
  // save's count — hence no monotonic guard here (unlike saveLeadProgress).
  const payload = {
    ...progress,
    target_cohort: targetCohort,
    completed_at: new Date().toISOString(),
  };
  const { data: existingLead } = await admin
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingLead) {
    await admin.from("leads").update(payload).eq("id", existingLead.id);
  } else {
    await admin.from("leads").insert({ email, ...payload });
  }

  // Compute the plan once for the free summary (missed-topic names, days, count).
  // The plan CONTENT (items) + flashcards are withheld until verification.
  let summary: FreeResultSummary | null = null;
  try {
    const plan = await buildPlanPreview(answers, targetCohort);
    summary = {
      score,
      weakSpecialties: plan.weakSpecialties,
      daysToExam: plan.daysToExam,
      planItemCount: plan.totalItems,
    };
  } catch (e) {
    console.error("finalizeLeadResult plan build failed:", e);
    summary = { score, weakSpecialties: [], daysToExam: null, planItemCount: 0 };
  }
  return { ok: true, summary };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. REQUEST CLAIM CODE — anti-abuse ladder, then email a 6-digit code. Handles
//    the "corrigir e-mail" path (re-key the finisher onto the corrected address).
// ═══════════════════════════════════════════════════════════════════════════════

export async function requestClaimCode(input: {
  email: string;
  previousEmail?: string | null; // set when correcting a mistyped address
  firstName?: string | null;
  honeypot?: string | null;
  turnstileToken?: string | null;
}): Promise<{ ok: boolean; reason?: string; maskedEmail?: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };

  const ip = await clientIp();
  const verdict = await guardCodeRequest({
    email,
    ip,
    honeypot: input.honeypot,
    turnstileToken: input.turnstileToken,
  });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const admin = createAdminClient();
  const firstName = cleanFirstName(input.firstName);

  // ── "corrigir e-mail": re-key the just-finished lead onto the new address ─────
  const previousEmail = input.previousEmail ? normalizeEmail(input.previousEmail) : null;
  if (previousEmail && previousEmail !== email) {
    const { data: prev } = await admin
      .from("leads")
      .select(
        "id, score, weak_specialty_ids, result, target_cohort, questions_answered, completed_at",
      )
      .eq("email", previousEmail)
      .maybeSingle();
    const { data: target } = await admin
      .from("leads")
      .select("id, drip_status")
      .eq("email", email)
      .maybeSingle();

    if (prev && target && prev.id !== target.id) {
      if (target.drip_status === "converted") {
        // The corrected address already belongs to a BUYER. Never overwrite a
        // converted buyer's row (would clobber their result_token / drip state).
        // Just drop the stray finisher row; the buyer keeps their record. The
        // code still issues to `email` below (harmless for a member).
        await admin.from("leads").delete().eq("id", prev.id);
      } else {
        // Corrected address exists but isn't a buyer → merge the finisher's result
        // onto it and RESET the drip to a fresh funnel entry, so the just-finished
        // (still-unverified) lead isn't born mid-drip on the target's old progress.
        await admin
          .from("leads")
          .update({
            score: prev.score ?? null,
            weak_specialty_ids: prev.weak_specialty_ids ?? [],
            result: prev.result ?? null,
            target_cohort: prev.target_cohort ?? "revalida-2026-2",
            questions_answered: prev.questions_answered ?? null,
            completed_at: prev.completed_at ?? null,
            // Fresh entry: verify happens next; drip starts only once verified.
            verified_at: null,
            drip_step: 0,
            drip_status: "active",
            last_emailed_at: null,
            converted_at: null,
          })
          .eq("id", target.id);
        await admin.from("leads").delete().eq("id", prev.id);
      }
    } else if (prev && !target) {
      // No conflict → re-key the finisher row's email in place.
      await admin.from("leads").update({ email }).eq("id", prev.id);
    }
    // else: no prev found (odd) → fall through and just (re)issue on `email`.
  }

  // Load the lead we'll issue the code to (create it if somehow missing).
  const { data: lead } = await admin
    .from("leads")
    .select("id, code_sent_at")
    .eq("email", email)
    .maybeSingle();

  let leadId = lead?.id as string | undefined;
  if (!leadId) {
    const { data: created } = await admin
      .from("leads")
      .insert({ email })
      .select("id")
      .single();
    leadId = created?.id as string | undefined;
  }
  if (!leadId) return { ok: false, reason: "server_error" };

  // Per-address resend throttle (DB-backed, reliable across instances).
  if (lead?.code_sent_at) {
    const since = Date.now() - new Date(lead.code_sent_at as string).getTime();
    if (since < CODE_RESEND_MIN_MS) return { ok: false, reason: "too_soon" };
  }

  const code = genCode();
  await admin
    .from("leads")
    .update({
      verification_code: code,
      code_sent_at: new Date().toISOString(),
      code_attempts: 0,
      ...(firstName ? { first_name: firstName } : {}),
    })
    .eq("id", leadId);

  // Send the code (AWAITED — serverless kills fire-and-forget). If email is not
  // configured at all (no_api_key, dev), treat as sent so the flow is testable;
  // a genuine send error (e.g. unverified domain) surfaces to the UI.
  const res = await sendTemplateEmail({
    kind: "lead-code",
    to: email,
    vars: { code, greeting: greetingFor(firstName) },
    fromName: FUNNEL_SENDER_NAME,
  });
  if (!res.ok && res.reason !== "no_api_key") {
    console.error("lead-code send failed:", res.reason);
    return { ok: false, reason: "send_failed" };
  }

  return { ok: true, maskedEmail: maskEmail(email) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. VERIFY CLAIM CODE — confirm the code, mark verified, fire the delivery email,
//    and return the reward (durable token + full plan + flashcard demo).
// ═══════════════════════════════════════════════════════════════════════════════

export async function verifyClaimCode(input: {
  email: string;
  code: string;
  firstName?: string | null;
}): Promise<{
  ok: boolean;
  reason?: string;
  resultToken?: string;
  plan?: PlanPreview | null;
  sampleCards?: MagnetFlashcard[];
}> {
  const email = normalizeEmail(input.email);
  const code = (input.code ?? "").replace(/\D/g, "");
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  if (code.length !== 6) return { ok: false, reason: "invalid_code" };

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select(
      "id, verification_code, code_sent_at, code_attempts, result, weak_specialty_ids, target_cohort, first_name, result_token, unsubscribe_token, verified_at",
    )
    .eq("email", email)
    .maybeSingle();

  if (!lead || !lead.verification_code || !lead.code_sent_at) {
    return { ok: false, reason: "no_code" };
  }

  const age = Date.now() - new Date(lead.code_sent_at as string).getTime();
  if (age > CODE_TTL_MS) return { ok: false, reason: "expired" };

  if ((lead.code_attempts as number) >= CODE_MAX_ATTEMPTS) {
    // Burn the code so a maxed-out attempt string can't be brute-forced further.
    await admin.from("leads").update({ verification_code: null }).eq("id", lead.id);
    return { ok: false, reason: "too_many_attempts" };
  }

  if (code !== (lead.verification_code as string)) {
    const attempts = (lead.code_attempts as number) + 1;
    await admin.from("leads").update({ code_attempts: attempts }).eq("id", lead.id);
    return {
      ok: false,
      reason: attempts >= CODE_MAX_ATTEMPTS ? "too_many_attempts" : "invalid_code",
    };
  }

  // ── Correct code → verify ──────────────────────────────────────────────────
  const firstName = cleanFirstName(input.firstName) ?? (lead.first_name as string | null);
  const alreadyVerified = Boolean(lead.verified_at);
  await admin
    .from("leads")
    .update({
      verified_at: (lead.verified_at as string | null) ?? new Date().toISOString(),
      verification_code: null,
      code_attempts: 0,
      ...(firstName ? { first_name: firstName } : {}),
    })
    .eq("id", lead.id);

  const resultToken = lead.result_token as string;
  const targetCohort = (lead.target_cohort as string | null) ?? "revalida-2026-2";
  const answers = answersFromStoredResult(lead.result);
  const weakIds = (lead.weak_specialty_ids as number[] | null) ?? [];

  // Fire the delivery email once (present tense, personalized). Only on the FIRST
  // verification — re-confirming from the same session must not re-send. Awaited
  // but non-fatal: a delivery-email failure must not block the on-page reveal.
  if (!alreadyVerified) {
    try {
      const res = await sendTemplateEmail({
        kind: "lead-d0",
        to: email,
        vars: {
          greeting: greetingFor(firstName),
          resultUrl: resultUrl(resultToken),
          unsubscribeUrl: unsubscribeUrl((lead.unsubscribe_token as string) ?? ""),
        },
        fromName: FUNNEL_SENDER_NAME,
      });
      if (!res.ok && res.reason !== "no_api_key") {
        console.error("lead-d0 delivery send failed:", res.reason);
      }
    } catch (e) {
      console.error("lead-d0 delivery send threw:", e);
    }
  }

  // Rebuild the reward server-side (never trust the client's re-post).
  const [plan, sampleCards] = await Promise.all([
    buildPlanPreview(answers, targetCohort).catch((e) => {
      console.error("verify plan build failed:", e);
      return null;
    }),
    getSampleFlashcardsForSpecialties(weakIds, 3).catch(() => [] as MagnetFlashcard[]),
  ]);

  return { ok: true, resultToken, plan, sampleCards };
}
