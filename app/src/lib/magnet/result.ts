import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildPlanPreview,
  type MagnetAnswer,
  type PlanPreview,
} from "@/lib/magnet/plan-preview";
import { getSampleFlashcardsForSpecialties, type MagnetFlashcard } from "@/lib/magnet/flashcards";

// Server loader for the durable "meu material" page
// (/simulado-honesto/resultado?lead=<result_token>). Reconstructs the reward from
// the stored lead row so it survives cross-device opens — every funnel email links
// here, never the bare quiz URL. FREE-FUNNEL-V2-SCOPE.md Group 3.
//
// Plain server module (not "use server") — imported by the resultado server page.
// Reads via the service-role admin client (leads has deny-all RLS); the token IS
// the auth (unguessable UUID, only emailed after verification).

export type LeadReward = {
  score: number;
  plan: PlanPreview | null;
  sampleCards: MagnetFlashcard[];
  email: string;
  cohort: string;
};

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

export async function getRewardByToken(token: string): Promise<LeadReward | null> {
  if (!token) return null;
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("leads")
    .select("email, score, weak_specialty_ids, result, target_cohort")
    .eq("result_token", token)
    .maybeSingle();
  if (!lead) return null;

  const cohort = (lead.target_cohort as string | null) ?? "revalida-2026-2";
  const answers = answersFromStoredResult(lead.result);
  const weakIds = (lead.weak_specialty_ids as number[] | null) ?? [];

  const [plan, sampleCards] = await Promise.all([
    buildPlanPreview(answers, cohort).catch(() => null),
    getSampleFlashcardsForSpecialties(weakIds, 3).catch(() => [] as MagnetFlashcard[]),
  ]);

  return {
    score: (lead.score as number | null) ?? answers.filter((a) => a.isCorrect).length,
    plan,
    sampleCards,
    email: (lead.email as string) ?? "",
    cohort,
  };
}
