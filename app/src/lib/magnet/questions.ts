import { createAdminClient } from "@/lib/supabase/admin";
import type { QuizQuestionData } from "@/components/content/quiz-renderer";

// The free "Questões Revalida" magnet (FREE-FUNNEL-BUILD-SPEC.md §3.1).
//
// 5 FREE questions render server-side in the page HTML (instant + indexable);
// the 10 GATED questions are returned by the unlock server action only after an
// email is captured.
//
// Curated set (Karina, 2026-07-01): 15 real past-exam Revalida questions
// (2020–2025.2), reusing the quiz_questions rows already live in the Revalida
// section. FREE = first 5 in Karina's doc order; GATED = the next 10. Where the
// same question is cross-listed under >1 specialty page, we pick the best clinical
// fit (that page's specialty_id drives the weak-specialty diagnostic).
//
//   FREE
//   3169  Q22  2020    Saúde Coletiva     rastreamento CA colorretal      [dup: 2560 Cirurgia Geral]
//   2758  Q94  2022.2  Ginecologia        candidíase VV recorrente (gestante)
//   2765  Q14  2023.2  Ginecologia        terapia hormonal do climatério
//   3303  Q33  2021    Pediatria          cisto do conduto tireoglosso
//   3033  Q25  2024.1  Pediatria          cólera / diarreia aguda
//   GATED
//   3214  Q47  2021    Saúde Coletiva     PNAB / regionalização
//   2893  Q6   2022.2  Nefrologia         DRC + albuminúria (IECA/BRA)    [dup: 2532 Cardiologia]
//   2912  Q16  2024.1  Neurologia         migrânea com aura
//   3099  Q26  2025.1  Pneumologia        exacerbação de DPOC
//   2831  Q3   2022.1  Hematologia        PTI pediátrica
//   3138  Q71  2025.2  Psiquiatria        crise de pânico
//   3344  Q43  2023.2  Reumatologia       vasculite por IgA               [dup: 420 old format]
//   2717  Q96  2024.1  Gastroenterologia  doença inflamatória intestinal
//   2855  Q26  2025.2  Infectologia       dengue grupo C
//   2696  Q24  2024.2  Endocrinologia     hipotireoidismo na gestação     [dup: 2956 Obstetrícia]

export const MAGNET_FREE_IDS = [3169, 2758, 2765, 3303, 3033];
export const MAGNET_GATED_IDS = [
  3214, 2893, 2912, 3099, 2831, 3138, 3344, 2717, 2855, 2696,
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
