import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizQuestionData } from "@/components/content/quiz-renderer";

// The free "Simulado Honesto" magnet (FREE-FUNNEL-BUILD-SPEC.md §3.1).
//
// 5 FREE questions render server-side in the page HTML (instant + indexable);
// the 10 GATED questions are returned by the unlock server action only after an
// email is captured. Ids are a SEED spread across 10 specialties so the
// diagnostic produces a meaningful weak-specialty map — Karina will swap these
// for a curated high-yield set later (just edit the two arrays).

export const MAGNET_FREE_IDS = [802, 389, 2512, 2152, 1222];
export const MAGNET_GATED_IDS = [
  1492, 2857, 2903, 2915, 1962, 2132, 1112, 1132, 2698, 2711,
];
export const MAGNET_ALL_IDS = [...MAGNET_FREE_IDS, ...MAGNET_GATED_IDS];
export const MAGNET_TOTAL = MAGNET_ALL_IDS.length; // 15

export type MagnetQuestion = QuizQuestionData & {
  pageId: number;
  specialtyId: number | null;
};

// Server-only: reads the curated questions via the service-role client (the
// member QuizPlayer path proves this works) and returns them in the requested
// id order, each tagged with its specialty for the diagnostic + plan preview.
export async function getMagnetQuestions(ids: number[]): Promise<MagnetQuestion[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();

  const { data: questions } = await admin
    .from("quiz_questions")
    .select("id, position, question, answers, media_url, explanation_html, page_id")
    .in("id", ids);
  if (!questions || questions.length === 0) return [];

  const pageIds = [...new Set(questions.map((q) => q.page_id as number))];
  const { data: pages } = await admin
    .from("pages")
    .select("id, specialty_id")
    .in("id", pageIds);
  const specByPage = new Map(
    (pages ?? []).map((p) => [p.id as number, (p.specialty_id as number | null) ?? null]),
  );

  const byId = new Map(questions.map((q) => [q.id as number, q]));
  // Preserve the requested order (FREE first, then GATED).
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => ({
      id: q.id as number,
      position: q.position as number,
      question: q.question as string,
      answers: q.answers as QuizQuestionData["answers"],
      media_url: (q.media_url as string | null) ?? null,
      explanation_html: (q.explanation_html as string | null) ?? null,
      pageId: q.page_id as number,
      specialtyId: specByPage.get(q.page_id as number) ?? null,
    }));
}
