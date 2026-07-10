import { createAdminClient } from "@/lib/supabase/admin";
import { SIMULADO_BLOCOS, SIMULADO_100_IDS } from "@/lib/magnet/simulado-questions";

// Server-only loaders/scoring for the free 100-question simulado funnel
// (/simulado-revalida). The 100 questions are REAL past-Revalida (INEP) items
// curated by scripts/build-simulado-100.js into 5 blocos of 20 by grande área.
//
// IMPORTANT: explanation_html is deliberately NOT selected here. The full
// comentário is the member-gated upsell — it must never reach the free client
// payload. The session shows only right/wrong + the correct alternative.

export type SimuladoAnswerOption = { text: string; correct: boolean };

export type SimuladoQuestion = {
  id: number;
  question: string; // HTML — includes the real "Questão NN · Revalida 20xx" header
  answers: SimuladoAnswerOption[];
  media_url: string | null;
  blocoKey: string;
  blocoLabel: string;
  specialtyId: number | null;
};

// { "<quiz_questions.id>": { a: chosen answer index, c: correct? } }
export type SimuladoProgress = Record<string, { a: number; c: boolean }>;

export type SimuladoAreaScore = {
  key: string;
  label: string;
  correct: number;
  answered: number;
  total: number;
};

const BLOCO_BY_QUESTION = new Map<number, { key: string; label: string }>(
  SIMULADO_BLOCOS.flatMap((b) => b.questionIds.map((id) => [id, { key: b.key, label: b.label }] as const)),
);

// Loads the full 100-question set in bloco order, each tagged with its bloco and
// specialty. Service-role read (quiz_questions RLS is member-gated; this funnel is
// pre-auth). 100 rows — well under the PostgREST 1000-row cap.
export async function getSimuladoQuestions(): Promise<SimuladoQuestion[]> {
  const admin = createAdminClient();

  const { data: questions } = await admin
    .from("quiz_questions")
    .select("id, question, answers, media_url, page_id")
    .in("id", SIMULADO_100_IDS);
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
  return SIMULADO_100_IDS.map((id) => {
    const q = byId.get(id);
    if (!q) return null;
    const bloco = BLOCO_BY_QUESTION.get(id);
    return {
      id,
      question: q.question as string,
      answers: (q.answers as SimuladoAnswerOption[]).map((a) => ({
        text: a.text,
        correct: Boolean(a.correct),
      })),
      media_url: (q.media_url as string | null) ?? null,
      blocoKey: bloco?.key ?? "outros",
      blocoLabel: bloco?.label ?? "Outros",
      specialtyId: specByPage.get(q.page_id as number) ?? null,
    };
  }).filter((q): q is SimuladoQuestion => q !== null);
}

// Per-grande-área score derived from the stored progress map. Pure — used by the
// finalize action (persists into leads.sim_area_scores) and testable in isolation.
export function computeSimuladoAreaScores(progress: SimuladoProgress): SimuladoAreaScore[] {
  return SIMULADO_BLOCOS.map((b) => {
    let correct = 0;
    let answered = 0;
    for (const id of b.questionIds) {
      const p = progress[String(id)];
      if (!p) continue;
      answered++;
      if (p.c) correct++;
    }
    return { key: b.key, label: b.label, correct, answered, total: b.questionIds.length };
  });
}

export function computeSimuladoScore(progress: SimuladoProgress): number {
  return Object.values(progress).filter((p) => p.c).length;
}
