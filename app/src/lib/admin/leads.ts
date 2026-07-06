import { createAdminClient } from "@/lib/supabase/admin";

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
  score: number | null;
  questionsAnswered: number | null;
  completed: boolean;
  weakSpecialties: string[];
  verified: boolean;
  dripStep: number;
  dripStatus: string;
  convertedAt: string | null;
  lastEmailedAt: string | null;
  tier: LeadTier;
  // 'exit_intent' = captured by the "salvar para depois" modal (never did the quiz);
  // null = normal quiz-gate capture. Drives the list badge + capture filter.
  captureSource: string | null;
  // Which funnel the lead entered through: 'simulado-honesto' (quiz, the default) or
  // 'flashcards-50' (gift-first flashcards magnet). Drives the Funil badge + filter.
  source: string;
  isTest: boolean;
  // Soft-archive (schema-patch-leads-archive.sql). Hidden by default in the list;
  // "Mostrar arquivados" reveals. Independent of drip_status.
  isArchived: boolean;
};

export type LeadsSummary = {
  total: number;
  verified: number;
  completed: number;
  converted: number;
  unsubscribed: number;
  bySource: { source: string | null; count: number }[];
  byCohort: { cohort: string | null; count: number }[];
};

export type LeadsOverview = { rows: LeadRow[]; summary: LeadsSummary };

function tierOf(converted: boolean, verified: boolean, completed: boolean): LeadTier {
  if (converted) return "customer";
  if (!verified) return "suppressed";
  return completed ? "hot" : "nurture";
}

export async function getLeadsOverview(): Promise<LeadsOverview> {
  const admin = createAdminClient();

  const [{ data: leads }, { data: specialties }] = await Promise.all([
    admin
      .from("leads")
      .select(
        "id, email, first_name, created_at, utm_source, utm_campaign, target_cohort, score, questions_answered, completed_at, weak_specialty_ids, verified_at, drip_step, drip_status, converted_at, last_emailed_at, capture_source, source, is_test, is_archived",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    // 12-row reference table — cheap join to turn weak_specialty_ids into names.
    admin.from("specialties").select("id, name"),
  ]);

  const specialtyName = new Map<number, string>(
    (specialties ?? []).map((s) => [s.id as number, s.name as string]),
  );

  const rows: LeadRow[] = (leads ?? []).map((l) => {
    const verified = Boolean(l.verified_at);
    const completed = Boolean(l.completed_at);
    const weakIds = (l.weak_specialty_ids as number[] | null) ?? [];
    return {
      id: l.id as string,
      email: l.email as string,
      firstName: (l.first_name as string | null) ?? null,
      createdAt: l.created_at as string,
      utmSource: (l.utm_source as string | null) ?? null,
      utmCampaign: (l.utm_campaign as string | null) ?? null,
      // target_cohort is NOT NULL DEFAULT 'revalida-2026-2' at the DB level, so a
      // soft-captured lead carries the default even though they never chose. The
      // cohort picker is only reached AFTER Q15 (chooseCohort → finalize), so
      // completed_at is the true "they picked a turma" signal. Surface null (→ "—")
      // for anyone who hasn't finished, rather than the misleading default.
      targetCohort: completed ? (l.target_cohort as string) : null,
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
      tier: tierOf(Boolean(l.converted_at), verified, completed),
      captureSource: (l.capture_source as string | null) ?? null,
      source: (l.source as string | null) ?? "simulado-honesto",
      isTest: Boolean(l.is_test),
      isArchived: Boolean(l.is_archived),
    };
  });

  const bySourceMap = new Map<string | null, number>();
  const byCohortMap = new Map<string | null, number>();
  let verified = 0;
  let completed = 0;
  let converted = 0;
  let unsubscribed = 0;
  for (const r of rows) {
    if (r.verified) verified++;
    if (r.completed) completed++;
    if (r.convertedAt) converted++;
    if (r.dripStatus === "unsubscribed") unsubscribed++;
    bySourceMap.set(r.utmSource, (bySourceMap.get(r.utmSource) ?? 0) + 1);
    byCohortMap.set(r.targetCohort, (byCohortMap.get(r.targetCohort) ?? 0) + 1);
  }

  const bySource = [...bySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
  const byCohort = [...byCohortMap.entries()]
    .map(([cohort, count]) => ({ cohort, count }))
    .sort((a, b) => b.count - a.count);

  return {
    rows,
    summary: {
      total: rows.length,
      verified,
      completed,
      converted,
      unsubscribed,
      bySource,
      byCohort,
    },
  };
}
