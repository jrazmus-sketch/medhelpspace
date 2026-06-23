import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-side review queries. Per the project's data-fetching invariant these
 * are plain async functions called from server components (never the browser
 * client). They read through the admin client filtered by `user_id` — the same
 * service-role pattern the dashboard uses for per-user data.
 */

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Counts ─────────────────────────────────────────────────────────────────────

export interface ReviewCounts {
  /** Non-suspended items due on/before today (all types). */
  dueTotal: number;
  dueFlashcards: number;
  dueQuiz: number;
  /** "Só as que errei" — non-suspended items whose last grade was incorrect
   *  (repetitions reset to 0), regardless of due date. */
  wrongTotal: number;
}

export async function getReviewCounts(userId: string): Promise<ReviewCounts> {
  const admin = createAdminClient();
  const today = todayKey();

  const due = () =>
    admin
      .from("review_schedule")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("suspended", false)
      .lte("due_date", today);

  const [{ count: dueTotal }, { count: dueFlashcards }, { count: dueQuiz }, { count: wrongTotal }] =
    await Promise.all([
      due(),
      due().eq("item_type", "flashcard"),
      due().eq("item_type", "quiz_question"),
      admin
        .from("review_schedule")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("suspended", false)
        .eq("repetitions", 0),
    ]);

  return {
    dueTotal: dueTotal ?? 0,
    dueFlashcards: dueFlashcards ?? 0,
    dueQuiz: dueQuiz ?? 0,
    wrongTotal: wrongTotal ?? 0,
  };
}

// ── Items ──────────────────────────────────────────────────────────────────────

export type ReviewItem =
  | {
      kind: "flashcard";
      id: number;
      specialtyId: number | null;
      text: string;
      answer: string;
      image_url: string | null;
      tip: string | null;
    }
  | {
      kind: "quiz";
      id: number;
      specialtyId: number | null;
      question: string;
      answers: { text: string; correct: boolean; feedback: string }[];
      explanation_html: string | null;
      media_url: string | null;
      /** Deep-link to the source page so a missed question links back to the lesson. */
      remediationHref: string | null;
    };

export type ReviewMode = "due" | "wrong";

/**
 * The reviewable items for a session, joined to their content and interleaved by
 * kind (quiz ↔ flashcard) so a session mixes retrieval formats. `mode`:
 *  - "due"   → items due on/before today (the daily queue)
 *  - "wrong" → items last answered incorrectly, any due date ("só as que errei")
 */
export async function getReviewItems(
  userId: string,
  mode: ReviewMode = "due",
  limit = 60,
): Promise<ReviewItem[]> {
  const admin = createAdminClient();
  const today = todayKey();

  let q = admin
    .from("review_schedule")
    .select("item_type, item_id, specialty_id")
    .eq("user_id", userId)
    .eq("suspended", false);

  if (mode === "due") {
    q = q.lte("due_date", today).order("due_date", { ascending: true });
  } else {
    q = q.eq("repetitions", 0).order("last_reviewed_at", { ascending: true, nullsFirst: true });
  }

  const { data: rows } = await q.limit(limit);
  const sched = rows ?? [];
  if (sched.length === 0) return [];

  const flashIds = sched.filter((r) => r.item_type === "flashcard").map((r) => r.item_id as number);
  const quizIds = sched.filter((r) => r.item_type === "quiz_question").map((r) => r.item_id as number);

  const [flashRes, quizRes] = await Promise.all([
    flashIds.length
      ? admin.from("flashcard_items").select("id, text, answer, image_url, tip").in("id", flashIds)
      : Promise.resolve({ data: [] as unknown[] }),
    quizIds.length
      ? admin
          .from("quiz_questions")
          .select("id, question, answers, explanation_html, media_url, page_id")
          .in("id", quizIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flashById = new Map((flashRes.data ?? []).map((f: any) => [f.id as number, f]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quizById = new Map((quizRes.data ?? []).map((qq: any) => [qq.id as number, qq]));

  // Remediation hrefs: quiz page → /app/<specialtySlug>/<pageSlug>.
  const hrefByPage = new Map<number, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageIds = [...new Set((quizRes.data ?? []).map((qq: any) => qq.page_id as number).filter(Boolean))];
  if (pageIds.length) {
    const { data: pages } = await admin.from("pages").select("id, slug, specialty_id").in("id", pageIds);
    const specIds = [...new Set((pages ?? []).map((p) => p.specialty_id).filter(Boolean))] as number[];
    const { data: specs } = specIds.length
      ? await admin.from("specialties").select("id, slug").in("id", specIds)
      : { data: [] as { id: number; slug: string }[] };
    const specSlug = new Map((specs ?? []).map((s) => [s.id as number, s.slug as string]));
    for (const p of pages ?? []) {
      const ss = p.specialty_id ? specSlug.get(p.specialty_id as number) : null;
      hrefByPage.set(p.id as number, ss ? `/app/${ss}/${p.slug}` : `/app/${p.slug}`);
    }
  }

  const items: ReviewItem[] = [];
  for (const r of sched) {
    if (r.item_type === "flashcard") {
      const f = flashById.get(r.item_id as number);
      if (f) {
        items.push({
          kind: "flashcard",
          id: r.item_id as number,
          specialtyId: (r.specialty_id as number | null) ?? null,
          text: f.text ?? "",
          answer: f.answer ?? "",
          image_url: f.image_url ?? null,
          tip: f.tip ?? null,
        });
      }
    } else if (r.item_type === "quiz_question") {
      const qq = quizById.get(r.item_id as number);
      if (qq) {
        items.push({
          kind: "quiz",
          id: r.item_id as number,
          specialtyId: (r.specialty_id as number | null) ?? null,
          question: qq.question ?? "",
          answers: Array.isArray(qq.answers) ? qq.answers : [],
          explanation_html: qq.explanation_html ?? null,
          media_url: qq.media_url ?? null,
          remediationHref: hrefByPage.get(qq.page_id as number) ?? null,
        });
      }
    }
  }

  return interleaveByKind(items);
}

/** Round-robin merge so quiz and flashcard items alternate where possible. */
function interleaveByKind(items: ReviewItem[]): ReviewItem[] {
  const quiz = items.filter((i) => i.kind === "quiz");
  const flash = items.filter((i) => i.kind === "flashcard");
  const out: ReviewItem[] = [];
  let qi = 0;
  let fi = 0;
  while (qi < quiz.length || fi < flash.length) {
    if (qi < quiz.length) out.push(quiz[qi++]);
    if (fi < flash.length) out.push(flash[fi++]);
  }
  return out;
}
