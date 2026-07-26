import { createAdminClient } from "@/lib/supabase/admin";

// Server-only loaders + grading for the free 100-question simulado
// (/simulado-revalida). Questions are 100 QUESTÕES INÉDITAS in the style of the
// INEP 1ª etapa, stored in the funnel-owned `simulado_questions` table.
//
// THE CENTRAL INVARIANT OF THIS FILE:
// the exam payload must never contain the gabarito. `getSimuladoExamQuestions`
// deliberately does not select correct_index, comentario, distratores,
// conceito_chave, area or tema — a candidate with devtools open must not be able
// to read the answers, and the whole point of the redesign is that no feedback
// appears until the exam is submitted. Grading happens here, server-side, from
// the stored answer map; the client never reports correctness.
//
// The commented gabarito is loaded by a separate function used only by the
// result page, which refuses to render until sim_completed_at is set.

export const SIMULADO_SET_VERSION = 2;
export const SIMULADO_TOTAL = 100;

// httpOnly cookie holding the lead's result_token for the duration of the exam.
// Declared here rather than in actions/simulado.ts because a "use server" module
// may only export async functions.
export const SIM_SESSION_COOKIE = "mhs_sim";
export const SIM_SESSION_MAX_AGE = 60 * 60 * 24 * 120; // 120 days

// Minimum answered questions before "entregar a prova" is allowed. Without a
// floor, anyone could submit immediately and unlock all 100 comentários, which
// defeats the rule that the gabarito is released only on completion.
export const SIMULADO_MIN_ANSWERS = 50;

export const SIMULADO_AREAS = [
  "clinica-medica",
  "cirurgia",
  "go",
  "pediatria",
  "saude-coletiva",
] as const;

export type SimuladoArea = (typeof SIMULADO_AREAS)[number];

// The five grandes áreas the report breaks performance down by, named as Karina
// specified. Note `go`: she classifies Ginecologia and Obstetrícia separately in
// her source sheet (8 + 10) but reports them as one área of 18 — the candidate
// sees the combined figure.
export const SIMULADO_AREA_LABELS: Record<SimuladoArea, string> = {
  "clinica-medica": "Clínica Médica",
  cirurgia: "Cirurgia Geral",
  go: "Ginecologia e Obstetrícia",
  pediatria: "Pediatria",
  "saude-coletiva": "Saúde Coletiva",
};

// What the exam surface receives. Note the absence of anything answer-shaped.
export type SimuladoExamQuestion = {
  id: number;
  position: number; // 1..100, the order of the caderno
  enunciado: string;
  alternatives: string[]; // exactly 4, in A-D order
  mediaUrl: string | null;
};

// { "<simulado_questions.id>": { a: <chosen index 0..3> } }
// No correctness key: the client is never told, and never tells us.
export type SimuladoProgress = Record<string, { a: number }>;

export type SimuladoAreaScore = {
  key: SimuladoArea;
  label: string;
  correct: number;
  answered: number;
  total: number;
};

export type SimuladoGrade = {
  score: number; // correct answers, 0..100
  answered: number;
  blank: number;
  wrong: number;
  areaScores: SimuladoAreaScore[];
  // Temas of the questions they missed. Deliberately a LIST, never a percentage:
  // all 100 questions cover distinct temas, so any per-tema rate would be 0% or
  // 100% off a single question and would misrepresent what the candidate knows.
  temasToReview: string[];
};

export function isSimuladoArea(value: string): value is SimuladoArea {
  return (SIMULADO_AREAS as readonly string[]).includes(value);
}

// ── Exam payload (no gabarito) ───────────────────────────────────────────────

export async function getSimuladoExamQuestions(): Promise<SimuladoExamQuestion[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("simulado_questions")
    .select("id, position, enunciado, alternatives, media_url")
    .eq("set_version", SIMULADO_SET_VERSION)
    .order("position", { ascending: true });

  if (error || !data) return [];

  return data.map((q) => ({
    id: q.id as number,
    position: q.position as number,
    enunciado: q.enunciado as string,
    alternatives: (q.alternatives as string[]) ?? [],
    mediaUrl: (q.media_url as string | null) ?? null,
  }));
}

// How many questions each grande área contributes, read from the set itself so
// the landing page can never drift from what the exam actually contains. The
// split is deliberately NOT 20/20/20/20/20 — it mirrors the real weighting.
export async function getSimuladoAreaCounts(): Promise<
  { key: SimuladoArea; label: string; count: number }[]
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("simulado_questions")
    .select("area")
    .eq("set_version", SIMULADO_SET_VERSION);

  const counts = new Map<SimuladoArea, number>();
  for (const area of SIMULADO_AREAS) counts.set(area, 0);
  if (!error && data) {
    for (const row of data) {
      const area = row.area as SimuladoArea;
      if (counts.has(area)) counts.set(area, (counts.get(area) ?? 0) + 1);
    }
  }

  return SIMULADO_AREAS.map((key) => ({
    key,
    label: SIMULADO_AREA_LABELS[key],
    count: counts.get(key) ?? 0,
  }));
}

// ── Commented review (server-only, post-submission) ──────────────────────────

// Reference pass mark for the 1ª etapa, out of 100. Read from site_content
// (`sim.report.cut_score`) so Karina can correct it without a deploy — it is a
// claim about the exam, not about us, and it must be easy to keep accurate.
export const SIMULADO_DEFAULT_CUT_SCORE = 60;

export function parseCutScore(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : SIMULADO_DEFAULT_CUT_SCORE;
}

export type SimuladoReviewItem = {
  id: number;
  position: number;
  enunciado: string;
  alternatives: string[];
  correctIndex: number;
  chosenIndex: number | null; // null = deixou em branco
  flagged: boolean;
  comentario: string;
  distratores: string;
  conceitoChave: string;
  mediaUrl: string | null;
  area: SimuladoArea;
  areaLabel: string;
  tema: string;
};

// The full commented gabarito, joined to what the candidate actually answered.
//
// ONLY the result page may call this, and only after sim_completed_at is set: it
// carries every correct answer and every comentário. It must never be reachable
// from the exam surface — that is the whole basis of the no-feedback design.
export async function getSimuladoReviewItems(
  progress: SimuladoProgress,
  flagged: number[],
): Promise<SimuladoReviewItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("simulado_questions")
    .select(
      "id, position, enunciado, alternatives, correct_index, comentario, distratores, conceito_chave, media_url, area, tema",
    )
    .eq("set_version", SIMULADO_SET_VERSION)
    .order("position", { ascending: true });

  if (error || !data) return [];

  const flaggedSet = new Set(flagged.map((n) => Number(n)));

  return data.map((q) => {
    const id = q.id as number;
    const pick = progress[String(id)];
    const area = q.area as SimuladoArea;
    return {
      id,
      position: q.position as number,
      enunciado: q.enunciado as string,
      alternatives: (q.alternatives as string[]) ?? [],
      correctIndex: q.correct_index as number,
      chosenIndex: typeof pick?.a === "number" ? pick.a : null,
      flagged: flaggedSet.has(id),
      comentario: q.comentario as string,
      distratores: q.distratores as string,
      conceitoChave: q.conceito_chave as string,
      mediaUrl: (q.media_url as string | null) ?? null,
      area,
      areaLabel: SIMULADO_AREA_LABELS[area] ?? "",
      tema: q.tema as string,
    };
  });
}

// ── Grading (server-only) ────────────────────────────────────────────────────

type GradingRow = {
  id: number;
  correct_index: number;
  area: SimuladoArea;
  tema: string;
};

async function loadGradingRows(): Promise<GradingRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("simulado_questions")
    .select("id, correct_index, area, tema")
    .eq("set_version", SIMULADO_SET_VERSION)
    .order("position", { ascending: true });

  if (error || !data) return [];
  return data.map((q) => ({
    id: q.id as number,
    correct_index: q.correct_index as number,
    area: q.area as SimuladoArea,
    tema: q.tema as string,
  }));
}

// Grades a stored answer map against the DB. The only place correctness is ever
// determined. `answered`/`blank` are counted over the full set, so a submitted
// exam with blanks reports honestly instead of scoring out of what was attempted.
export async function gradeSimulado(progress: SimuladoProgress): Promise<SimuladoGrade> {
  const rows = await loadGradingRows();

  const byArea = new Map<SimuladoArea, { correct: number; answered: number; total: number }>();
  for (const area of SIMULADO_AREAS) byArea.set(area, { correct: 0, answered: 0, total: 0 });

  let score = 0;
  let answered = 0;
  const temasToReview: string[] = [];

  for (const row of rows) {
    const bucket = byArea.get(row.area);
    if (bucket) bucket.total++;

    const pick = progress[String(row.id)];
    if (!pick || typeof pick.a !== "number") continue;

    answered++;
    if (bucket) bucket.answered++;

    if (pick.a === row.correct_index) {
      score++;
      if (bucket) bucket.correct++;
    } else {
      temasToReview.push(row.tema);
    }
  }

  const areaScores: SimuladoAreaScore[] = SIMULADO_AREAS.map((key) => {
    const b = byArea.get(key)!;
    return { key, label: SIMULADO_AREA_LABELS[key], ...b };
  });

  return {
    score,
    answered,
    blank: rows.length - answered,
    wrong: answered - score,
    areaScores,
    temasToReview,
  };
}

// ── Turma options for the funnel picker ──────────────────────────────────────

export type CohortOption = { slug: string; label: string; when: string };

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// Every ACTIVE turma, ordered by exam date — deliberately not filtered by
// is_for_sale. The picker's job is segmentation, not selling: someone sitting the
// nearest exam must be able to say so even when that turma is closed, otherwise
// every new lead is silently misfiled as a prospect for a later edition and can
// receive sales mail about an exam that is days away or already past.
export async function getActiveCohortOptions(): Promise<CohortOption[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cohorts")
    .select("slug, name, test_date")
    .eq("active", true)
    .order("test_date", { ascending: true });

  if (error || !data) return [];

  return data.map((c) => {
    const d = new Date(c.test_date as string);
    return {
      slug: c.slug as string,
      label: c.name as string,
      when: `Prova em ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`,
    };
  });
}
