import { createAdminClient } from "@/lib/supabase/admin";
import { BROADCAST_KIND } from "@/lib/email-render";

// Server-only read model for the /admin/leads viewer. `leads` is deny-all RLS
// (service-role only — see schema-patch-leads.sql), so this MUST run through
// createAdminClient() from a server component. The free-funnel v2 build owns the
// `leads` schema (schema-patch-leads-verify-claim.sql); this file only READS it.
//
// `verification_code`/`code_sent_at`/`code_attempts` are deliberately NOT selected
// — the code is a live short-lived secret and never belongs in an admin UI.

// Drip targeting tier, mirroring the funnel's segmentation + the partial index
// `leads_drip_verified_idx` (active AND verified). See FREE-FUNNEL-V2-SCOPE §6.
//   customer   = converted (bought)          (terminal — out of the drip)
//   hot        = verified + finished all 15  (aggressive offer)
//   nurture    = verified but didn't finish  (light nurture)
//   suppressed = unverified                  (NOT emailed — protects the domain)
// `customer` OUTRANKS the rest: a buyer is a customer regardless of verify/finish.
// Without it a lead who converted via purchase (never did the 6-digit verify) would
// read as "Cold", contradicting the green Converted status pill beside it.
export type LeadTier = "customer" | "hot" | "nurture" | "suppressed";

// The three free offerings a lead can join. A lead can be in more than one: the
// flashcards magnet and the 100-question simulado are separate front doors to the
// same list, and people cross between them.
export type FunnelKey = "quiz" | "flashcards" | "simulado";

// MEMBERSHIP IS NOT `source`. `source` is FIRST-TOUCH and is deliberately never
// overwritten (see startSimulado / claimFlashcards), so a lead who arrived via the
// flashcards magnet reads `flashcards-50` forever — including after they sign up for
// the simulado. Reading membership off `source` is what made second signups invisible
// in this panel. The backend already settled the correct test: "this funnel's
// membership test is `fc_entered_at`, not `source`" (actions/magnet.ts). This mirrors it.
function funnelsOf(l: {
  source: string;
  questionsAnswered: number | null;
  fcEnteredAt: string | null;
  simEnteredAt: string | null;
}): FunnelKey[] {
  const out: FunnelKey[] = [];
  // The original 15-question quiz predates the per-funnel timestamps, so it has no
  // `quiz_entered_at` to test — arriving through its gate, or answering a question,
  // is the signal.
  if (l.source === "simulado-honesto" || (l.questionsAnswered ?? 0) > 0) out.push("quiz");
  if (l.fcEnteredAt) out.push("flashcards");
  if (l.simEnteredAt) out.push("simulado");
  return out;
}

export type LeadRow = {
  id: string;
  email: string;
  firstName: string | null;
  createdAt: string;
  utmSource: string | null;
  utmCampaign: string | null;
  // null = the lead never reached the post-Q15 cohort picker (unfinished). The
  // admin UI renders this as "—" rather than a misleading default turma.
  targetCohort: string | null;
  // The turma the lead ORIGINALLY chose, when a reassignment (retired turma /
  // admin bulk-assign) later overwrote targetCohort. The list renders
  // "2026.2 → 2027.1" so the panel never misreports the lead's actual pick.
  // Gated on `completed` like targetCohort: an uncompleted lead's stored value
  // was only ever the column default, not a choice.
  previousTargetCohort: string | null;
  score: number | null;
  questionsAnswered: number | null;
  completed: boolean;
  weakSpecialties: string[];
  verified: boolean;
  dripStep: number;
  dripStatus: string;
  convertedAt: string | null;
  lastEmailedAt: string | null;
  // When this lead last received a hand-written broadcast (kind 'lead-broadcast'),
  // as opposed to an automated drip rung. `last_emailed_at` cannot answer this — it
  // is stamped by every sender — so it comes from lead_email_events.
  lastBroadcastAt: string | null;
  tier: LeadTier;
  // 'exit_intent' = captured by the "salvar para depois" modal (never did the quiz);
  // null = normal quiz-gate capture. Drives the list badge + capture filter.
  captureSource: string | null;
  // FIRST-TOUCH origin: 'simulado-honesto' (quiz, the default), 'flashcards-50'
  // (gift-first flashcards magnet) or 'simulado-100'. Never overwritten, so it answers
  // "where did this lead come from" and NOT "which funnels are they in" — use
  // `funnels` for the latter.
  source: string;
  // Every free offering this lead has actually entered, oldest signal first.
  funnels: FunnelKey[];
  // Which drip sequence currently OWNS the lead. Entering a new funnel hands over
  // ownership and resets that funnel's step counters, so this is the sequence they
  // are receiving mail from right now — which is not necessarily where they started.
  dripFunnel: FunnelKey;
  fcEnteredAt: string | null;
  fcStartedAt: string | null;
  fcCompletedAt: string | null;
  simEnteredAt: string | null;
  simStartedAt: string | null;
  simCompletedAt: string | null;
  simAnswered: number | null;
  simScore: number | null;
  isTest: boolean;
  // Soft-archive (schema-patch-leads-archive.sql). Hidden by default in the list;
  // "Mostrar arquivados" reveals. Independent of drip_status.
  isArchived: boolean;
};

function tierOf(converted: boolean, verified: boolean, completed: boolean): LeadTier {
  if (converted) return "customer";
  if (!verified) return "suppressed";
  return completed ? "hot" : "nurture";
}

// Rows only — every headline stat (funnel stages, tiles, chips) is derived
// CLIENT-side in leads-client.tsx from this one array, so the table and the
// stats can never disagree. Tests/archived are excluded there by one shared
// predicate (QA mode re-includes tests everywhere at once).
export async function getLeadsRows(): Promise<LeadRow[]> {
  const admin = createAdminClient();

  const [{ data: leads }, { data: specialties }] = await Promise.all([
    admin
      .from("leads")
      .select(
        "id, email, first_name, created_at, utm_source, utm_campaign, target_cohort, previous_target_cohort, score, questions_answered, completed_at, weak_specialty_ids, verified_at, drip_step, drip_status, converted_at, last_emailed_at, capture_source, source, is_test, is_archived, drip_funnel, fc_entered_at, fc_started_at, fc_completed_at, sim_entered_at, sim_started_at, sim_completed_at, sim_answered, sim_score",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    // 12-row reference table — cheap join to turn weak_specialty_ids into names.
    admin.from("specialties").select("id, name"),
  ]);

  // Last hand-written broadcast per address. Kept as its own narrow query rather than
  // widening the leads select: `last_emailed_at` is stamped by the drip crons too, so
  // it can never answer "did WE write to this person".
  const { data: broadcastRows } = await admin
    .from("lead_email_events")
    .select("email, created_at")
    .eq("kind", BROADCAST_KIND)
    .eq("event_type", "sent")
    .order("created_at", { ascending: false })
    .limit(5000);

  const lastBroadcast = new Map<string, string>();
  for (const b of (broadcastRows ?? []) as { email: string; created_at: string }[]) {
    // Rows arrive newest-first, so the first sighting of an address is its latest.
    const key = b.email.toLowerCase();
    if (!lastBroadcast.has(key)) lastBroadcast.set(key, b.created_at);
  }

  const specialtyName = new Map<number, string>(
    (specialties ?? []).map((s) => [s.id as number, s.name as string]),
  );

  return (leads ?? []).map((l) => {
    const verified = Boolean(l.verified_at);
    const completed = Boolean(l.completed_at);
    const weakIds = (l.weak_specialty_ids as number[] | null) ?? [];
    const source = (l.source as string | null) ?? "simulado-honesto";
    return {
      id: l.id as string,
      email: l.email as string,
      firstName: (l.first_name as string | null) ?? null,
      createdAt: l.created_at as string,
      utmSource: (l.utm_source as string | null) ?? null,
      utmCampaign: (l.utm_campaign as string | null) ?? null,
      // target_cohort is NOT NULL DEFAULT 'revalida-2027-1' at the DB level, so a
      // soft-captured lead carries the default even though they never chose. The
      // cohort picker is only reached AFTER Q15 (chooseCohort → finalize), so
      // completed_at is the true "they picked a turma" signal. Surface null (→ "—")
      // for anyone who hasn't finished, rather than the misleading default.
      targetCohort: completed ? (l.target_cohort as string) : null,
      previousTargetCohort: completed ? ((l.previous_target_cohort as string | null) ?? null) : null,
      score: (l.score as number | null) ?? null,
      questionsAnswered: (l.questions_answered as number | null) ?? null,
      completed,
      weakSpecialties: weakIds
        .map((id) => specialtyName.get(id))
        .filter((n): n is string => Boolean(n)),
      verified,
      dripStep: (l.drip_step as number | null) ?? 0,
      dripStatus: (l.drip_status as string) ?? "active",
      convertedAt: (l.converted_at as string | null) ?? null,
      lastEmailedAt: (l.last_emailed_at as string | null) ?? null,
      lastBroadcastAt: lastBroadcast.get((l.email as string).toLowerCase()) ?? null,
      tier: tierOf(Boolean(l.converted_at), verified, completed),
      captureSource: (l.capture_source as string | null) ?? null,
      source,
      funnels: funnelsOf({
        source,
        questionsAnswered: (l.questions_answered as number | null) ?? null,
        fcEnteredAt: (l.fc_entered_at as string | null) ?? null,
        simEnteredAt: (l.sim_entered_at as string | null) ?? null,
      }),
      // Rows written before drip_funnel existed carry null; they are all quiz-era.
      dripFunnel: ((l.drip_funnel as FunnelKey | null) ?? "quiz") as FunnelKey,
      fcEnteredAt: (l.fc_entered_at as string | null) ?? null,
      fcStartedAt: (l.fc_started_at as string | null) ?? null,
      fcCompletedAt: (l.fc_completed_at as string | null) ?? null,
      simEnteredAt: (l.sim_entered_at as string | null) ?? null,
      simStartedAt: (l.sim_started_at as string | null) ?? null,
      simCompletedAt: (l.sim_completed_at as string | null) ?? null,
      simAnswered: (l.sim_answered as number | null) ?? null,
      simScore: (l.sim_score as number | null) ?? null,
      isTest: Boolean(l.is_test),
      isArchived: Boolean(l.is_archived),
    };
  });
}
