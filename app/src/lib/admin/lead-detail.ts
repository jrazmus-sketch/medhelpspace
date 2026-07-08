import { createAdminClient } from "@/lib/supabase/admin";

// Server-only read model for the /admin/leads detail drawer. `leads` and
// `lead_email_events` are deny-all RLS (service-role only), so this MUST run through
// createAdminClient() from a server context (the getLeadDetail server action gates the
// caller's role first). This file only READS; the funnel + email pipelines own writes.
//
// `verification_code` is deliberately NEVER selected — it's a live short-lived secret.

// ── One resolved email in the drawer timeline ─────────────────────────────────
// Built by merging the deterministic inferred schedule (what the crons WOULD have
// sent, derived from drip/recovery state) with the REAL Resend events grouped by
// message id. A tracked entry (real 'sent' row) always wins over its inferred twin.
export type LeadEmail = {
  kind: string | null; // template kind (lead-d0 / lead-d1 / lead-code / lead-recover-*)
  sentAt: string; // exact for tracked; estimated (verified_at + offset) for inferred
  estimated: boolean; // true = date is an estimate, not a recorded send
  tracked: boolean; // true = backed by real Resend events (engagement below is real)
  delivered: boolean;
  opens: number;
  lastOpenAt: string | null;
  clicks: number;
  lastClickAt: string | null;
  clickedUrls: string[];
  bounced: boolean;
  complained: boolean;
};

// One answered question in the free simulado, resolved to its specialty name.
export type LeadQuizAnswer = {
  questionId: number;
  specialtyId: number | null;
  specialtyName: string | null;
  isCorrect: boolean;
};

// One pre-capture funnel beacon (landing / quiz_start) linked via funnel_session_id.
export type LeadFunnelEvent = { type: string; at: string };

// One post-capture on-site action, aggregated by type (lead_events). `count` = how
// many times this lead did it; `lastAt` = most recent occurrence.
export type LeadSiteEvent = { type: string; count: number; lastAt: string };

export type LeadDetail = {
  id: string;
  email: string;
  firstName: string | null;
  createdAt: string;

  // Attribution
  source: string | null;
  captureSource: string | null; // 'exit_intent' (salvou p/ depois) | null (quiz)
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;

  // Capture context (Phase 3 — null for leads captured before the patch)
  deviceType: string | null;
  geoCity: string | null;
  geoRegion: string | null;
  geoCountry: string | null;
  landingReferrer: string | null;
  landingPath: string | null;
  userAgent: string | null;

  // Quiz result
  score: number | null;
  questionsAnswered: number | null;
  weakSpecialties: string[];
  answers: LeadQuizAnswer[];

  // Verify funnel timing
  codeSentAt: string | null;
  codeAttempts: number;
  verifiedAt: string | null;
  completedAt: string | null;

  // Status / drip
  dripStep: number;
  dripStatus: string;
  lastEmailedAt: string | null;
  convertedAt: string | null;
  unsubscribedAt: string | null;
  recoveryASentAt: string | null;
  recoveryBStep: number;
  recoverySentAt: string | null;
  targetCohort: string | null;

  // Durable links
  resultToken: string | null;

  // Journey
  funnelSessionId: string | null;
  funnelEvents: LeadFunnelEvent[];

  // On-site actions after capture (lead_events), aggregated by type
  siteEvents: LeadSiteEvent[];

  // Emails (merged inferred + tracked)
  emails: LeadEmail[];
};

// The drip schedule, mirrored from the lead-drip cron. Offsets are days from
// verified_at (the clock start), so an inferred send date is verified_at + offset.
const DRIP_SCHEDULE: { step: number; kind: string; offsetDays: number }[] = [
  { step: 1, kind: "lead-d1", offsetDays: 1 },
  { step: 2, kind: "lead-d2", offsetDays: 2 },
  { step: 3, kind: "lead-d4", offsetDays: 4 },
  { step: 4, kind: "lead-d7", offsetDays: 7 },
];

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

type EventRow = {
  resend_id: string | null;
  kind: string | null;
  event_type: string;
  url: string | null;
  created_at: string;
};

// Fold the raw lead_email_events rows into one LeadEmail per Resend message id.
function groupTrackedEmails(events: EventRow[]): Map<string, LeadEmail> {
  const byKind = new Map<string, LeadEmail>(); // keyed by kind (or resend_id when kind unknown)
  const byResend = new Map<string, EventRow[]>();
  const noResend: EventRow[] = [];
  for (const e of events) {
    if (e.resend_id) {
      const arr = byResend.get(e.resend_id) ?? [];
      arr.push(e);
      byResend.set(e.resend_id, arr);
    } else {
      noResend.push(e);
    }
  }

  for (const [resendId, group] of byResend) {
    const sent = group.find((g) => g.event_type === "sent");
    const kind = group.find((g) => g.kind)?.kind ?? null;
    const key = kind ?? `resend:${resendId}`;
    const opens = group.filter((g) => g.event_type === "opened");
    const clicks = group.filter((g) => g.event_type === "clicked");
    const times = group.map((g) => g.created_at).sort();
    byKind.set(key, {
      kind,
      sentAt: sent?.created_at ?? times[0],
      estimated: false,
      tracked: true,
      delivered: group.some((g) => g.event_type === "delivered"),
      opens: opens.length,
      lastOpenAt: opens.map((o) => o.created_at).sort().at(-1) ?? null,
      clicks: clicks.length,
      lastClickAt: clicks.map((c) => c.created_at).sort().at(-1) ?? null,
      clickedUrls: [...new Set(clicks.map((c) => c.url).filter((u): u is string => Boolean(u)))],
      bounced: group.some((g) => g.event_type === "bounced"),
      complained: group.some((g) => g.event_type === "complained"),
    });
  }
  return byKind;
}

export async function fetchLeadDetail(id: string): Promise<LeadDetail | null> {
  const admin = createAdminClient();

  const { data: lead } = await admin
    .from("leads")
    .select(
      "id, email, first_name, created_at, source, capture_source, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, device_type, geo_city, geo_region, geo_country, landing_referrer, landing_path, user_agent, funnel_session_id, score, questions_answered, weak_specialty_ids, result, code_sent_at, code_attempts, verified_at, completed_at, drip_step, drip_status, last_emailed_at, converted_at, unsubscribed_at, recovery_a_sent_at, recovery_b_step, recovery_sent_at, target_cohort, result_token",
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) return null;

  const email = (lead.email as string).toLowerCase();

  const [{ data: specialties }, { data: eventRows }, { data: siteEventRows }] = await Promise.all([
    admin.from("specialties").select("id, name"),
    admin
      .from("lead_email_events")
      .select("resend_id, kind, event_type, url, created_at")
      .eq("email", email)
      .order("created_at", { ascending: true }),
    admin
      .from("lead_events")
      .select("event_type, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false }),
  ]);

  // Aggregate on-site actions by type → count + most-recent timestamp.
  const siteEventMap = new Map<string, { count: number; lastAt: string }>();
  for (const r of (siteEventRows ?? []) as { event_type: string; created_at: string }[]) {
    const cur = siteEventMap.get(r.event_type);
    if (cur) {
      cur.count += 1;
      if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
    } else {
      siteEventMap.set(r.event_type, { count: 1, lastAt: r.created_at });
    }
  }
  const siteEvents: LeadSiteEvent[] = [...siteEventMap.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  const specialtyName = new Map<number, string>(
    (specialties ?? []).map((s) => [s.id as number, s.name as string]),
  );

  // Funnel journey (pre-capture beacons) — only when the lead carries a session id.
  let funnelEvents: LeadFunnelEvent[] = [];
  const funnelSessionId = (lead.funnel_session_id as string | null) ?? null;
  if (funnelSessionId) {
    const { data: fe } = await admin
      .from("funnel_events")
      .select("event_type, created_at")
      .eq("session_id", funnelSessionId)
      .order("created_at", { ascending: true });
    funnelEvents = (fe ?? []).map((r) => ({
      type: r.event_type as string,
      at: r.created_at as string,
    }));
  }

  // Per-question breakdown from the stored result JSON.
  const result = (lead.result as { question_id?: number; specialty_id?: number | null; is_correct?: boolean }[] | null) ?? [];
  const answers: LeadQuizAnswer[] = Array.isArray(result)
    ? result.map((r) => ({
        questionId: Number(r.question_id ?? 0),
        specialtyId: r.specialty_id ?? null,
        specialtyName: r.specialty_id != null ? specialtyName.get(r.specialty_id) ?? null : null,
        isCorrect: Boolean(r.is_correct),
      }))
    : [];

  const weakIds = (lead.weak_specialty_ids as number[] | null) ?? [];
  const weakSpecialties = weakIds
    .map((wid) => specialtyName.get(wid))
    .filter((n): n is string => Boolean(n));

  // ── Build the merged email timeline ─────────────────────────────────────────
  const tracked = groupTrackedEmails((eventRows ?? []) as EventRow[]);
  const emailsByKind = new Map<string, LeadEmail>();

  // 1) Inferred backbone — the deterministic schedule from drip/recovery state.
  const verifiedAt = lead.verified_at as string | null;
  const codeSentAt = lead.code_sent_at as string | null;
  const dripStep = (lead.drip_step as number | null) ?? 0;
  const recoveryASentAt = lead.recovery_a_sent_at as string | null;
  const recoveryBStep = (lead.recovery_b_step as number | null) ?? 0;
  const recoverySentAt = lead.recovery_sent_at as string | null;

  const pushInferred = (kind: string, sentAt: string | null, estimated: boolean) => {
    if (!sentAt) return;
    emailsByKind.set(kind, {
      kind,
      sentAt,
      estimated,
      tracked: false,
      delivered: false,
      opens: 0,
      lastOpenAt: null,
      clicks: 0,
      lastClickAt: null,
      clickedUrls: [],
      bounced: false,
      complained: false,
    });
  };

  if (codeSentAt) pushInferred("lead-code", codeSentAt, false); // exact — code_sent_at is recorded
  if (verifiedAt) pushInferred("lead-d0", verifiedAt, false); // fires at verification
  if (verifiedAt) {
    for (const s of DRIP_SCHEDULE) {
      if (dripStep >= s.step) pushInferred(s.kind, addDays(verifiedAt, s.offsetDays), true);
    }
  }
  if (recoveryASentAt) pushInferred("lead-recover-finished", recoveryASentAt, false);
  if (recoveryBStep >= 1) pushInferred("lead-recover-unfinished-1", recoverySentAt, false);
  if (recoveryBStep >= 2) pushInferred("lead-recover-unfinished-2", recoverySentAt, false);

  // 2) Overlay tracked emails — real events win (exact time + engagement).
  for (const [key, em] of tracked) emailsByKind.set(key, em);

  const emails = [...emailsByKind.values()].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );

  return {
    id: lead.id as string,
    email,
    firstName: (lead.first_name as string | null) ?? null,
    createdAt: lead.created_at as string,

    source: (lead.source as string | null) ?? null,
    captureSource: (lead.capture_source as string | null) ?? null,
    utmSource: (lead.utm_source as string | null) ?? null,
    utmMedium: (lead.utm_medium as string | null) ?? null,
    utmCampaign: (lead.utm_campaign as string | null) ?? null,
    utmTerm: (lead.utm_term as string | null) ?? null,
    utmContent: (lead.utm_content as string | null) ?? null,
    gclid: (lead.gclid as string | null) ?? null,

    deviceType: (lead.device_type as string | null) ?? null,
    geoCity: (lead.geo_city as string | null) ?? null,
    geoRegion: (lead.geo_region as string | null) ?? null,
    geoCountry: (lead.geo_country as string | null) ?? null,
    landingReferrer: (lead.landing_referrer as string | null) ?? null,
    landingPath: (lead.landing_path as string | null) ?? null,
    userAgent: (lead.user_agent as string | null) ?? null,

    score: (lead.score as number | null) ?? null,
    questionsAnswered: (lead.questions_answered as number | null) ?? null,
    weakSpecialties,
    answers,

    codeSentAt,
    codeAttempts: (lead.code_attempts as number | null) ?? 0,
    verifiedAt,
    completedAt: (lead.completed_at as string | null) ?? null,

    dripStep,
    dripStatus: (lead.drip_status as string) ?? "active",
    lastEmailedAt: (lead.last_emailed_at as string | null) ?? null,
    convertedAt: (lead.converted_at as string | null) ?? null,
    unsubscribedAt: (lead.unsubscribed_at as string | null) ?? null,
    recoveryASentAt,
    recoveryBStep,
    recoverySentAt,
    targetCohort: (lead.target_cohort as string | null) ?? null,

    resultToken: (lead.result_token as string | null) ?? null,

    funnelSessionId,
    funnelEvents,
    siteEvents,

    emails,
  };
}
