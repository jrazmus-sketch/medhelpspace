"use server";

import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplateEmail } from "@/lib/email";
import { FUNNEL_SENDER_NAME } from "@/lib/email-render";
import { honeypotTripped, isDisposableEmail } from "@/lib/magnet/anti-abuse";
import {
  simuladoAccessUrl,
  unsubscribeUrl,
  SIMULADO_SOURCE,
  VALID_TARGET_COHORTS,
  REVALIDA_2027_1_SLUG,
} from "@/lib/magnet/links";
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

  const targetCohort = VALID_TARGET_COHORTS.has(input.targetCohort)
    ? input.targetCohort
    : REVALIDA_2027_1_SLUG;

  const admin = createAdminClient();
  const utm = input.utm ?? {};
  const ctx = await captureContext();
  const now = new Date().toISOString();

  const { data: existing } = await admin
    .from("leads")
    .select(
      "id, result_token, unsubscribe_token, sim_started_at, first_name, device_type, landing_referrer, landing_path, funnel_session_id",
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
    const patch: Record<string, unknown> = {
      target_cohort: targetCohort,
      completed_at: now,
      sim_set_version: SIMULADO_SET_VERSION,
    };
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
        target_cohort: targetCohort,
        first_name: firstName,
        completed_at: now,
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
