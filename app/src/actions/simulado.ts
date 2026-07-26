"use server";

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import { honeypotTripped, isDisposableEmail, guardCodeRequest } from "@/lib/magnet/anti-abuse";
import { getClientIp } from "@/lib/pagbank/rate-limit";
import {
  simuladoAccessUrl,
  unsubscribeUrl,
  SIMULADO_SOURCE,
  REVALIDA_2027_1_SLUG,
  DRIP_FUNNEL,
} from "@/lib/magnet/links";
import { isValidTargetCohort, resolveTargetCohort } from "@/lib/magnet/cohort-rollover";
import {
  gradeSimulado,
  SIM_SESSION_COOKIE,
  SIM_SESSION_MAX_AGE,
  SIMULADO_MIN_ANSWERS,
  SIMULADO_SET_VERSION,
  SIMULADO_TOTAL,
  type SimuladoProgress,
} from "@/lib/magnet/simulado";

// Server actions for the rebuilt /simulado-revalida funnel.
//
// Entry model (changed in v2): the candidate does NOT wait for an email before
// starting. Name + e-mail + turma are collected on-site and the exam begins
// immediately, because the inbox round-trip is where the majority of cold-traffic
// drop-off happens and it lands at the moment of peak motivation. The resume link
// is emailed in the background; verification is prompted later, in-exam, at a
// point where it serves the candidate (a 100-question exam is multi-session).
//
// Session auth is an httpOnly cookie holding the lead's result_token, so the token
// never reaches client JS or the URL bar on the immediate-start path.
//
// SECURITY: a brand-new address starts instantly, but an address that ALREADY has
// exam activity never hands out a session — otherwise anyone could type a stranger's
// e-mail and read their answers and results. Those are sent the resume link instead.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// NOTE: a "use server" module may export async functions ONLY — exporting the
// cookie name from here would crash every route that imports it. It lives in
// lib/magnet/simulado.ts.

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function cleanFirstName(name?: string | null): string | null {
  const n = (name ?? "").trim().slice(0, 60);
  return n.length > 0 ? n : null;
}

function greetingFor(firstName?: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `Oi, ${n}! ` : "Oi! ";
}

async function clientIp(): Promise<string> {
  try {
    return getClientIp(await headers());
  } catch {
    return "unknown";
  }
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const stars = "*".repeat(Math.max(3, local.length - 1));
  return `${local.slice(0, 1)}${stars}@${email.slice(at + 1)}`;
}

function clamp(v: string | null | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function parseDevice(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return "tablet";
  if (/mobi|android|iphone/.test(s)) return "mobile";
  return ua ? "desktop" : "unknown";
}

async function captureContext() {
  try {
    const h = await headers();
    const ua = h.get("user-agent") ?? "";
    const dec = (v: string | null) => {
      if (!v) return null;
      try {
        return decodeURIComponent(v);
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

async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SIM_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SIM_SESSION_MAX_AGE,
  });
}

// Resolves the acting lead from the session cookie. Every write below goes through
// this — there is no client-supplied lead id or token anywhere in the exam surface.
async function leadFromSession() {
  const store = await cookies();
  const token = store.get(SIM_SESSION_COOKIE)?.value;
  if (!token) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("leads")
    .select("id, email, first_name, sim_progress, sim_flagged, sim_completed_at, sim_started_at")
    .eq("result_token", token)
    .maybeSingle();
  return data ?? null;
}

// ── Start ────────────────────────────────────────────────────────────────────

export async function startSimulado(input: {
  firstName: string;
  email: string;
  targetCohort: string;
  honeypot?: string | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    term?: string | null;
    content?: string | null;
    gclid?: string | null;
  };
  context?: { referrer?: string | null; landingPath?: string | null; sessionId?: string | null };
}): Promise<
  | { status: "started" }
  | { status: "resume_emailed"; maskedEmail: string }
  | { status: "error"; reason: string }
> {
  const email = normalizeEmail(input.email);
  const firstName = cleanFirstName(input.firstName);

  if (!EMAIL_RE.test(email)) return { status: "error", reason: "invalid_email" };
  if (honeypotTripped(input.honeypot)) return { status: "error", reason: "honeypot" };
  if (isDisposableEmail(email)) return { status: "error", reason: "disposable_email" };

  // Validated against the live `cohorts` table, not a hardcoded list: a turma
  // added in the admin panel must be selectable the same day.
  const targetCohort = await resolveTargetCohort(input.targetCohort, REVALIDA_2027_1_SLUG);

  const admin = createAdminClient();
  const utm = input.utm ?? {};
  const ctx = await captureContext();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("leads")
    .select(
      "id, result_token, unsubscribe_token, sim_started_at, sim_entered_at, completed_at, drip_funnel, first_name, device_type, landing_referrer, landing_path, funnel_session_id",
    )
    .eq("email", email)
    .maybeSingle();

  let resultToken: string;
  let unsubscribeToken: string;
  let alreadyStarted = false;

  if (existing) {
    resultToken = existing.result_token as string;
    unsubscribeToken = existing.unsubscribe_token as string;
    alreadyStarted = Boolean(existing.sim_started_at);

    // First-touch attribution only: `source` is never overwritten, and context
    // fields are filled only while still null.
    //
    // THE ADDRESS MAY ALREADY BELONG TO ANOTHER FUNNEL. That is common — someone
    // who did the 15-question quiz in July comes back and does the simulado. The
    // row keeps its original `source` (that is what first-touch means), so the
    // simulado's membership test is `sim_entered_at`, not `source`.
    const patch: Record<string, unknown> = {
      target_cohort: targetCohort,
      sim_set_version: SIMULADO_SET_VERSION,
    };
    // NEVER overwrite completed_at. It is the OTHER funnel's drip clock, and
    // stamping it here silently reset a sequence the lead was already in.
    if (existing.completed_at == null) patch.completed_at = now;

    // Taking ownership of the shared step counter. Without this a cross-funnel
    // lead arrives carrying the other sequence's drip_step and the simulado
    // ladder resumes at that rung — skipping every finish nudge and dropping
    // them straight into the sales spine.
    //
    // Gated on OWNERSHIP CHANGING, not on first-ever entry: a lead can go
    // simulado → flashcards → simulado, and on the way back `sim_entered_at` is
    // already set, so a first-entry test would hand them to this ladder without
    // resetting it. The clock moves with the ladder — pacing an 8-rung sequence
    // from a three-week-old timestamp makes every rung instantly due and fires
    // the whole spine on consecutive days.
    if (existing.drip_funnel !== DRIP_FUNNEL.simulado) {
      patch.drip_funnel = DRIP_FUNNEL.simulado;
      patch.sim_entered_at = now;
      patch.drip_step = 0;
      patch.sim_reminder_step = 0;
      patch.sim_sales_step = 0;
    }
    if (firstName && !existing.first_name) patch.first_name = firstName;
    if (existing.device_type == null) {
      patch.user_agent = ctx.user_agent;
      patch.device_type = ctx.device_type;
      patch.geo_country = ctx.geo_country;
      patch.geo_region = ctx.geo_region;
      patch.geo_city = ctx.geo_city;
    }
    if (existing.landing_referrer == null) patch.landing_referrer = clamp(input.context?.referrer, 400);
    if (existing.landing_path == null) patch.landing_path = clamp(input.context?.landingPath, 300);
    if (existing.funnel_session_id == null) patch.funnel_session_id = clamp(input.context?.sessionId, 64);

    await admin.from("leads").update(patch).eq("id", existing.id);
  } else {
    const { data: inserted, error } = await admin
      .from("leads")
      .insert({
        email,
        source: SIMULADO_SOURCE,
        drip_funnel: DRIP_FUNNEL.simulado,
        target_cohort: targetCohort,
        first_name: firstName,
        completed_at: now,
        sim_entered_at: now,
        sim_set_version: SIMULADO_SET_VERSION,
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
        landing_referrer: clamp(input.context?.referrer, 400),
        landing_path: clamp(input.context?.landingPath, 300),
        funnel_session_id: clamp(input.context?.sessionId, 64),
      })
      .select("id, result_token, unsubscribe_token")
      .single();

    if (error || !inserted) return { status: "error", reason: "insert_failed" };
    resultToken = inserted.result_token as string;
    unsubscribeToken = inserted.unsubscribe_token as string;
  }

  // Send the resume link either way. Awaited: fire-and-forget is frozen by the
  // serverless runtime. Non-fatal — a send failure must not block the exam.
  try {
    await sendTemplateEmail({
      kind: "lead-sim-access",
      to: email,
      vars: {
        greeting: firstName ? `Oi, ${firstName}! ` : "Oi! ",
        accessUrl: simuladoAccessUrl(resultToken),
        unsubscribeUrl: unsubscribeUrl(unsubscribeToken),
      },
      fromName: FUNNEL_SENDER_NAME,
    });
  } catch (e) {
    console.error("lead-sim-access send threw:", e);
  }

  // An address with existing exam activity never receives a session from a form
  // post — that would let anyone read a stranger's answers. They resume by e-mail.
  if (alreadyStarted) {
    return { status: "resume_emailed", maskedEmail: maskEmail(email) };
  }

  await setSessionCookie(resultToken);
  return { status: "started" };
}

// ── Target turma ─────────────────────────────────────────────────────────────

// "Para qual prova você está estudando?" answered from the confirmation page.
// The one-click path (an emailed link) goes through /api/leads/turma instead —
// it has to write before a page renders, which only a route handler can do.
//
// Acts on the session lead, never on a client-supplied id, so this cannot be used
// to re-file somebody else's lead. Returns a discriminated value rather than
// throwing: Server Action error messages are redacted in production, so a thrown
// "INVALID_COHORT" would reach the client as an opaque digest.
export async function setSimuladoTargetCohort(
  slug: string,
): Promise<{ status: "saved"; cohort: string } | { status: "invalid" } | { status: "no_session" }> {
  const lead = await leadFromSession();
  if (!lead) return { status: "no_session" };

  const clean = (slug ?? "").trim();
  if (!(await isValidTargetCohort(clean))) return { status: "invalid" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("leads")
    .select("target_cohort, previous_target_cohort")
    .eq("id", lead.id)
    .maybeSingle();

  const current = (row?.target_cohort as string | null) ?? null;
  if (current === clean) return { status: "saved", cohort: clean };

  await admin
    .from("leads")
    .update({
      target_cohort: clean,
      // First change only — keeps the lead's ORIGINAL pick visible in /admin/leads.
      previous_target_cohort: (row?.previous_target_cohort as string | null) ?? current,
    })
    .eq("id", lead.id);

  return { status: "saved", cohort: clean };
}

// ── Email correction (design §2) ─────────────────────────────────────────────

// The exam is the last surface that can rescue a mistyped address. Once the
// resume-link email hard-bounces, the webhook sets drip_status='bounced' and every
// drip correctly excludes the lead for good — but the mhs_sim cookie lives 120 days,
// so the candidate is still identifiable HERE. Under an email gate a typo is
// otherwise a silent, total loss.
//
// Both actions act on the session lead only. Like setSimuladoTargetCohort they
// return discriminated values instead of throwing: Server Action errors are
// redacted in production, so a thrown reason reaches the client as an opaque digest.

const MAX_EMAIL_CORRECTIONS = 3;

export async function confirmSimuladoEmail(): Promise<{ status: "ok" | "no_session" }> {
  const lead = await leadFromSession();
  if (!lead) return { status: "no_session" };

  const admin = createAdminClient();
  await admin
    .from("leads")
    .update({ sim_email_confirmed_at: new Date().toISOString() })
    .eq("id", lead.id)
    .is("sim_email_confirmed_at", null);

  return { status: "ok" };
}

// NOTE the deliberately coarse result type. There is no "that address already
// belongs to someone else" variant, because answering that question for an
// arbitrary address turns this action into a lead-existence oracle: anyone can mint
// a session by submitting the landing form, so an enumeration answer here is
// effectively unauthenticated. Both outcomes return `sent` with identical copy.
export type CorrectEmailResult =
  | { status: "sent"; maskedEmail: string }
  | { status: "unchanged" }
  | { status: "invalid" }
  | { status: "blocked"; reason: string }
  | { status: "too_many" }
  | { status: "no_session" };

export async function correctSimuladoEmail(input: {
  email: string;
  turnstileToken?: string | null;
  honeypot?: string | null;
}): Promise<CorrectEmailResult> {
  const lead = await leadFromSession();
  if (!lead) return { status: "no_session" };

  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) return { status: "invalid" };
  if (email === normalizeEmail(lead.email as string)) return { status: "unchanged" };

  // THIS ACTION SENDS MAIL TO A CALLER-SUPPLIED ADDRESS, so it runs the same full
  // ladder as requestClaimCode — honeypot, disposable, per-IP rate limit,
  // Turnstile, MX/A. A session cookie is NOT a meaningful gate here: anyone can
  // mint one by submitting the landing form, so without this the action is an
  // open relay for branded mail to arbitrary third parties, which is exactly the
  // spam-cannon failure lib/magnet/anti-abuse.ts exists to prevent. The per-lead
  // cap below does not bound it either — leads are free to create.
  const verdict = await guardCodeRequest({
    email,
    ip: await clientIp(),
    honeypot: input.honeypot,
    turnstileToken: input.turnstileToken,
  });
  if (!verdict.ok) {
    return verdict.reason === "rate_limited"
      ? { status: "too_many" }
      : { status: "blocked", reason: verdict.reason };
  }

  const admin = createAdminClient();

  // Claim the correction BEFORE sending, atomically. Read-then-write let two
  // concurrent requests both observe the same count and both send; the RPC does
  // `UPDATE … WHERE sim_email_corrections < $2` in one statement and returns 0
  // rows when the ceiling is already reached.
  const { data: claimed, error: claimErr } = await admin.rpc("claim_sim_email_correction", {
    p_lead_id: lead.id,
    p_max: MAX_EMAIL_CORRECTIONS,
  });
  if (claimErr) {
    console.error("claim_sim_email_correction failed:", claimErr);
    return { status: "invalid" };
  }
  if (!claimed) return { status: "too_many" };

  const { data: self } = await admin
    .from("leads")
    .select("unsubscribe_token, result_token, first_name")
    .eq("id", lead.id)
    .single();

  // The corrected address may already be a lead of its own — `leads.email` is
  // unique, so we must never blind-update into a collision. We also do NOT merge
  // the rows or move this session onto the other one: that would hand whoever
  // holds this cookie the other lead's exam. That lead gets its OWN access link,
  // so the mail only ever reaches the inbox that already owned the address.
  const { data: other } = await admin
    .from("leads")
    .select("id, result_token, unsubscribe_token, first_name")
    .eq("email", email)
    .maybeSingle();

  const target = other
    ? {
        token: other.result_token as string,
        unsub: other.unsubscribe_token as string,
        name: cleanFirstName(other.first_name as string | null),
      }
    : {
        token: self?.result_token as string,
        unsub: self?.unsubscribe_token as string,
        name: cleanFirstName((self?.first_name as string | null) ?? null),
      };

  if (!other) {
    // Move the address. drip_status resets to 'active' because the suppression was
    // about the OLD mailbox — carrying 'bounced' across would keep the lead excluded
    // from every drip despite a now-deliverable address. verified_at clears because
    // nothing has been proven about this new address yet; simulado-drip treats a
    // corrected-but-unverified lead as unverified, so a redirected address cannot
    // pull the sequence along behind it.
    const { error: updErr } = await admin
      .from("leads")
      .update({
        email,
        drip_status: "active",
        verified_at: null,
        sim_email_confirmed_at: null,
      })
      .eq("id", lead.id);

    if (updErr) {
      console.error("correctSimuladoEmail update failed:", updErr);
      return { status: "invalid" };
    }
  }

  try {
    await sendTemplateEmail({
      kind: "lead-sim-access",
      to: email,
      vars: {
        greeting: greetingFor(target.name),
        accessUrl: simuladoAccessUrl(target.token),
        unsubscribeUrl: unsubscribeUrl(target.unsub),
      },
      fromName: FUNNEL_SENDER_NAME,
    });
  } catch (e) {
    // Non-fatal: the address is already corrected, and the drip will reach it.
    console.error("lead-sim-access resend threw:", e);
  }

  return { status: "sent", maskedEmail: maskEmail(email) };
}

// ── Progress ─────────────────────────────────────────────────────────────────

export async function saveSimuladoAnswers(input: {
  answered: SimuladoProgress;
  flagged: (number | string)[];
}): Promise<{ ok: boolean }> {
  const lead = await leadFromSession();
  if (!lead) return { ok: false };
  // A submitted exam is immutable — no editing answers after "entregar".
  if (lead.sim_completed_at) return { ok: false };

  // Sanitize: numeric-string ids, answer index 0..3, capped at the set size.
  const clean: SimuladoProgress = {};
  let n = 0;
  for (const [k, v] of Object.entries(input.answered ?? {})) {
    if (n >= SIMULADO_TOTAL) break;
    if (!/^\d+$/.test(k)) continue;
    const a = Number((v as { a?: unknown })?.a);
    if (!Number.isInteger(a) || a < 0 || a > 3) continue;
    clean[k] = { a };
    n++;
  }

  // Coerce before filtering: question ids are bigints, so depending on the client
  // (or a JSON round-trip) they can arrive as numeric strings. Rejecting those
  // silently dropped every "marcar para revisar" flag.
  const flagged = Array.from(
    new Set(
      (input.flagged ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ).slice(0, SIMULADO_TOTAL);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    sim_progress: clean,
    sim_flagged: flagged,
    sim_answered: n,
    sim_last_activity_at: now,
    sim_set_version: SIMULADO_SET_VERSION,
  };
  if (lead.sim_started_at == null && n > 0) patch.sim_started_at = now;

  const admin = createAdminClient();
  const { error } = await admin.from("leads").update(patch).eq("id", lead.id);
  if (error) {
    console.error("saveSimuladoAnswers failed:", error.message);
    return { ok: false };
  }
  return { ok: true };
}

// ── Submit ───────────────────────────────────────────────────────────────────

// "Entregar a prova". The single moment correctness is computed, and the gate that
// releases the diagnosis and the commented gabarito. Grades from the map already
// stored server-side, so a tampered client payload cannot influence the score.
export async function submitSimulado(): Promise<
  | { status: "submitted" }
  | { status: "already_submitted" }
  | { status: "too_few"; answered: number; minimum: number }
  | { status: "error" }
> {
  const lead = await leadFromSession();
  if (!lead) return { status: "error" };
  if (lead.sim_completed_at) return { status: "already_submitted" };

  const progress = (lead.sim_progress as SimuladoProgress | null) ?? {};
  const answered = Object.keys(progress).length;
  if (answered < SIMULADO_MIN_ANSWERS) {
    return { status: "too_few", answered, minimum: SIMULADO_MIN_ANSWERS };
  }

  const grade = await gradeSimulado(progress);
  const now = new Date().toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("leads")
    .update({
      sim_completed_at: now,
      sim_last_activity_at: now,
      sim_answered: grade.answered,
      sim_score: grade.score,
      sim_area_scores: grade.areaScores,
    })
    .eq("id", lead.id);

  if (error) {
    console.error("submitSimulado failed:", error.message);
    return { status: "error" };
  }
  return { status: "submitted" };
}
