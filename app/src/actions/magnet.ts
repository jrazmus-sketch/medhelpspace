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
import {
  resultUrl,
  unsubscribeUrl,
  flashcardsAccessUrl,
  VALID_TARGET_COHORTS,
  REVALIDA_2026_2_SLUG,
  FLASHCARDS_SOURCE,
} from "@/lib/magnet/links";
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

// Coarse device class from the User-Agent (mobile / tablet / desktop). Good enough
// for a "who's landing" split in /admin/leads; we don't need full UA parsing.
function parseDevice(ua: string): string {
  if (!ua) return "unknown";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/i.test(ua)) return "mobile";
  return "desktop";
}

function clamp(v: string | null | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

// Server-derived capture context: UA/device from the request header, geo from
// Vercel's edge headers (no external geo-IP service). Best-effort — a missing header
// (local dev, non-Vercel host) just yields nulls / "unknown".
async function captureContext(): Promise<{
  user_agent: string | null;
  device_type: string;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
}> {
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    const dec = (v: string | null) => {
      if (!v) return null;
      try {
        return decodeURIComponent(v); // Vercel URL-encodes city ("Sao%20Paulo")
      } catch {
        return v;
      }
    };
    return {
      user_agent: clamp(ua, 400),
      device_type: parseDevice(ua),
      geo_country: clamp(h.get("x-vercel-ip-country"), 8),
      geo_region: clamp(h.get("x-vercel-ip-country-region"), 16),
      geo_city: clamp(dec(h.get("x-vercel-ip-city")), 120),
    };
  } catch {
    return {
      user_agent: null,
      device_type: "unknown",
      geo_country: null,
      geo_region: null,
      geo_city: null,
    };
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
  // Client-only context the server can't otherwise see (first-touch). `sessionId` is
  // the mhs_fsid that links this lead ⇄ its funnel_events (landing/quiz_start).
  context?: { referrer?: string | null; landingPath?: string | null; sessionId?: string | null };
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
  // reset drip progress on a re-submit. Context columns are selected too so the
  // existing-lead path can honor first-touch (only fill what's still null).
  const { data: existing } = await admin
    .from("leads")
    .select(
      "id, questions_answered, device_type, landing_referrer, landing_path, funnel_session_id",
    )
    .eq("email", email)
    .maybeSingle();

  // Partial progress from the first 5 answers. Never sets completed_at — only the
  // Q15 finalize marks completion.
  const answers = input.answers ?? [];
  const progress = answers.length > 0 ? buildProgressPayload(answers) : null;

  const ctx = await captureContext();
  const referrer = clamp(input.context?.referrer, 400);
  const landingPath = clamp(input.context?.landingPath, 300);
  const sessionId = clamp(input.context?.sessionId, 64);

  if (existing) {
    // `?? undefined` omits the key from the PATCH so a later submit without a
    // value never wipes an already-captured attribution field. Progress is only
    // ADVANCED, never regressed: a re-submit of the gate must not overwrite the
    // deeper progress a finisher already stored.
    const grew =
      progress != null &&
      answers.length > ((existing.questions_answered as number | null) ?? 0);
    // First-touch context: only fill columns still null, so a later re-submit (or a
    // device switch mid-funnel) never rewrites the ORIGINAL arrival context.
    const ctxPatch: Record<string, unknown> = {};
    if (existing.device_type == null) {
      ctxPatch.user_agent = ctx.user_agent;
      ctxPatch.device_type = ctx.device_type;
      ctxPatch.geo_country = ctx.geo_country;
      ctxPatch.geo_region = ctx.geo_region;
      ctxPatch.geo_city = ctx.geo_city;
    }
    if (existing.landing_referrer == null && referrer) ctxPatch.landing_referrer = referrer;
    if (existing.landing_path == null && landingPath) ctxPatch.landing_path = landingPath;
    if (existing.funnel_session_id == null && sessionId) ctxPatch.funnel_session_id = sessionId;
    await admin
      .from("leads")
      .update({
        utm_source: utm.source ?? undefined,
        utm_medium: utm.medium ?? undefined,
        utm_campaign: utm.campaign ?? undefined,
        utm_term: utm.term ?? undefined,
        utm_content: utm.content ?? undefined,
        gclid: utm.gclid ?? undefined,
        ...ctxPatch,
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
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      geo_country: ctx.geo_country,
      geo_region: ctx.geo_region,
      geo_city: ctx.geo_city,
      landing_referrer: referrer,
      landing_path: landingPath,
      funnel_session_id: sessionId,
      ...(progress ?? {}),
    });
  }

  const gatedQuestions = await getMagnetQuestions(MAGNET_GATED_IDS);
  return { ok: true, gatedQuestions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1a. SAVE FOR LATER (exit-intent) — capture the email of a visitor LEAVING before
//     they finish (or even start) the quiz, so the pre-verify recovery cron (Segment
//     B) can nudge them back with the resume link. No answers, no gated unlock, and —
//     same domain-reputation discipline as the Q5 soft capture — NO email sent inline;
//     the sanctioned lead-recovery drip does the follow-up. Tagged
//     capture_source='exit_intent' so it's distinguishable in /admin/leads.
// ═══════════════════════════════════════════════════════════════════════════════

export async function saveLeadForLater(input: {
  email: string;
  utm?: Utm;
  honeypot?: string | null;
  context?: { referrer?: string | null; landingPath?: string | null; sessionId?: string | null };
}): Promise<{ ok: boolean; reason?: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  if (honeypotTripped(input.honeypot)) return { ok: false, reason: "honeypot" };
  if (isDisposableEmail(email)) return { ok: false, reason: "disposable_email" };

  const admin = createAdminClient();
  const utm = input.utm ?? {};

  const { data: existing } = await admin
    .from("leads")
    .select("id, capture_source, device_type, landing_referrer, landing_path, funnel_session_id")
    .eq("email", email)
    .maybeSingle();

  const ctx = await captureContext();
  const referrer = clamp(input.context?.referrer, 400);
  const landingPath = clamp(input.context?.landingPath, 300);
  const sessionId = clamp(input.context?.sessionId, 64);

  if (existing) {
    // Never regress a lead who already reached the quiz: only fill still-null context,
    // and only stamp capture_source if it was never set. Progress / drip / completed_at
    // are deliberately untouched here — an exit-intent re-submit must not downgrade a
    // lead who has real quiz progress.
    const patch: Record<string, unknown> = {};
    if (existing.device_type == null) {
      patch.user_agent = ctx.user_agent;
      patch.device_type = ctx.device_type;
      patch.geo_country = ctx.geo_country;
      patch.geo_region = ctx.geo_region;
      patch.geo_city = ctx.geo_city;
    }
    if (existing.landing_referrer == null && referrer) patch.landing_referrer = referrer;
    if (existing.landing_path == null && landingPath) patch.landing_path = landingPath;
    if (existing.funnel_session_id == null && sessionId) patch.funnel_session_id = sessionId;
    if (existing.capture_source == null) patch.capture_source = "exit_intent";
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("leads").update(patch).eq("id", existing.id);
      if (error) {
        console.error("saveLeadForLater update failed:", error.message);
        return { ok: false, reason: "server_error" };
      }
    }
  } else {
    const { error } = await admin.from("leads").insert({
      email,
      capture_source: "exit_intent",
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      gclid: utm.gclid ?? null,
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      geo_country: ctx.geo_country,
      geo_region: ctx.geo_region,
      geo_city: ctx.geo_city,
      landing_referrer: referrer,
      landing_path: landingPath,
      funnel_session_id: sessionId,
    });
    if (error) {
      console.error("saveLeadForLater insert failed:", error.message);
      return { ok: false, reason: "server_error" };
    }
  }

  return { ok: true };
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

// Canonical valid-turma set lives in lib/magnet/links.ts (mirrors the DB CHECK).
// NOTE: this quiz funnel's picker still only offers 2026.2 / 2027.1 — kept as the
// stable A/B control. The new /flashcards-revalida funnel is what surfaces 2027.2.
const VALID_COHORTS = VALID_TARGET_COHORTS;

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
    : REVALIDA_2026_2_SLUG;

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

// ═══════════════════════════════════════════════════════════════════════════════
// FLASHCARDS FUNNEL (gift-first A/B variant — /flashcards-revalida)
//   • Step 1 (email) → captureFlashcardsLead: SOFT capture, source='flashcards-50'.
//   • Step 2 (turma) → chooseFlashcardsCohortAndSend: store target_cohort +
//                      completed_at, then email the magic access link (lead-fc-access,
//                      the D0 delivery). The click (acesso route) stamps verified_at.
// Delivering the deck via the inbox guarantees a real, deliverable address for the
// welcome coupon + drip — the whole point of the magic-link gate. (FLASHCARDS_SOURCE
// lives in lib/magnet/links.ts — shared with the drip/recovery crons.)
// ═══════════════════════════════════════════════════════════════════════════════

export async function captureFlashcardsLead(input: {
  email: string;
  utm?: Utm;
  honeypot?: string | null;
  context?: { referrer?: string | null; landingPath?: string | null; sessionId?: string | null };
}): Promise<{ ok: boolean; reason?: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  if (honeypotTripped(input.honeypot)) return { ok: false, reason: "honeypot" };
  if (isDisposableEmail(email)) return { ok: false, reason: "disposable_email" };

  const admin = createAdminClient();
  const utm = input.utm ?? {};
  const ctx = await captureContext();
  const referrer = clamp(input.context?.referrer, 400);
  const landingPath = clamp(input.context?.landingPath, 300);
  const sessionId = clamp(input.context?.sessionId, 64);

  const { data: existing } = await admin
    .from("leads")
    .select("id, device_type, landing_referrer, landing_path, funnel_session_id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    // First-touch: only fill still-null attribution. `source` is NEVER overwritten —
    // a returning lead keeps their original funnel attribution.
    const ctxPatch: Record<string, unknown> = {};
    if (existing.device_type == null) {
      ctxPatch.user_agent = ctx.user_agent;
      ctxPatch.device_type = ctx.device_type;
      ctxPatch.geo_country = ctx.geo_country;
      ctxPatch.geo_region = ctx.geo_region;
      ctxPatch.geo_city = ctx.geo_city;
    }
    if (existing.landing_referrer == null && referrer) ctxPatch.landing_referrer = referrer;
    if (existing.landing_path == null && landingPath) ctxPatch.landing_path = landingPath;
    if (existing.funnel_session_id == null && sessionId) ctxPatch.funnel_session_id = sessionId;
    await admin
      .from("leads")
      .update({
        utm_source: utm.source ?? undefined,
        utm_medium: utm.medium ?? undefined,
        utm_campaign: utm.campaign ?? undefined,
        utm_term: utm.term ?? undefined,
        utm_content: utm.content ?? undefined,
        gclid: utm.gclid ?? undefined,
        ...ctxPatch,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("leads").insert({
      email,
      source: FLASHCARDS_SOURCE,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_term: utm.term ?? null,
      utm_content: utm.content ?? null,
      gclid: utm.gclid ?? null,
      user_agent: ctx.user_agent,
      device_type: ctx.device_type,
      geo_country: ctx.geo_country,
      geo_region: ctx.geo_region,
      geo_city: ctx.geo_city,
      landing_referrer: referrer,
      landing_path: landingPath,
      funnel_session_id: sessionId,
    });
  }
  return { ok: true };
}

export async function chooseFlashcardsCohortAndSend(input: {
  email: string;
  targetCohort: string;
  firstName?: string | null;
  utm?: Utm;
}): Promise<{ ok: boolean; reason?: string; maskedEmail?: string; emailed?: boolean; devLink?: string }> {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  const targetCohort = VALID_TARGET_COHORTS.has(input.targetCohort)
    ? input.targetCohort
    : REVALIDA_2026_2_SLUG;
  const firstName = cleanFirstName(input.firstName);

  const admin = createAdminClient();

  // Step 1 SHOULD have created the row; insert-if-missing defends against a
  // skipped/failed step 1 so we never lose the lead or leave the turma unset.
  const { data: existing } = await admin
    .from("leads")
    .select("id, result_token, unsubscribe_token")
    .eq("email", email)
    .maybeSingle();

  let resultToken: string;
  let unsubscribeToken: string;
  const completedAt = new Date().toISOString();
  if (existing) {
    resultToken = existing.result_token as string;
    unsubscribeToken = existing.unsubscribe_token as string;
    await admin
      .from("leads")
      .update({
        target_cohort: targetCohort,
        completed_at: completedAt,
        ...(firstName ? { first_name: firstName } : {}),
      })
      .eq("id", existing.id);
  } else {
    const ctx = await captureContext();
    const { data: inserted } = await admin
      .from("leads")
      .insert({
        email,
        source: FLASHCARDS_SOURCE,
        target_cohort: targetCohort,
        completed_at: completedAt,
        first_name: firstName,
        utm_source: input.utm?.source ?? null,
        utm_campaign: input.utm?.campaign ?? null,
        gclid: input.utm?.gclid ?? null,
        user_agent: ctx.user_agent,
        device_type: ctx.device_type,
        geo_country: ctx.geo_country,
        geo_region: ctx.geo_region,
        geo_city: ctx.geo_city,
      })
      .select("id, result_token, unsubscribe_token")
      .single();
    if (!inserted) return { ok: false, reason: "insert_failed" };
    resultToken = inserted.result_token as string;
    unsubscribeToken = inserted.unsubscribe_token as string;
  }

  // Deliver the magic access link (D0). Awaited (serverless kills fire-and-forget);
  // non-fatal — a send failure still shows the "check your inbox" state with a resend
  // option. In dev (no RESEND_API_KEY) we return the link so the flow is testable.
  let emailed = true;
  let devLink: string | undefined;
  const accessUrl = flashcardsAccessUrl(resultToken);
  try {
    const res = await sendTemplateEmail({
      kind: "lead-fc-access",
      to: email,
      vars: {
        greeting: greetingFor(firstName),
        accessUrl,
        unsubscribeUrl: unsubscribeUrl(unsubscribeToken),
      },
      fromName: FUNNEL_SENDER_NAME,
    });
    if (res.reason === "no_api_key") devLink = accessUrl;
    else if (!res.ok) {
      emailed = false;
      console.error("lead-fc-access send failed:", res.reason);
    }
  } catch (e) {
    emailed = false;
    console.error("lead-fc-access send threw:", e);
  }

  return { ok: true, maskedEmail: maskEmail(email), emailed, devLink };
}

// Persist the anonymous flashcard study session so the SAME magic link resumes where
// they left off (and so flashcards-drip can nudge non-finishers). Auth = result_token
// (the magic-link secret). Idempotent — writes the full answered map each call; the
// client debounces. Bounded + sanitized against a malformed/oversized payload.
export async function saveFlashcardsProgress(input: {
  token: string;
  answered: Record<string, "correct" | "incorrect">;
  done: boolean;
}): Promise<{ ok: boolean }> {
  const token = (input.token ?? "").trim();
  if (!token) return { ok: false };

  // Sanitize: numeric-string card ids, valid results, capped size.
  const clean: Record<string, "correct" | "incorrect"> = {};
  let n = 0;
  for (const [k, v] of Object.entries(input.answered ?? {})) {
    if (n >= 200) break;
    if (!/^\d+$/.test(k)) continue;
    if (v !== "correct" && v !== "incorrect") continue;
    clean[k] = v;
    n++;
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("id, fc_started_at, fc_completed_at")
    .eq("result_token", token)
    .maybeSingle();
  if (!lead) return { ok: false };

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    fc_progress: clean,
    fc_last_activity_at: nowIso,
  };
  if (lead.fc_started_at == null && n > 0) patch.fc_started_at = nowIso;
  if (input.done && lead.fc_completed_at == null) patch.fc_completed_at = nowIso;

  const { error } = await admin.from("leads").update(patch).eq("id", lead.id);
  if (error) {
    console.error("saveFlashcardsProgress failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
